/**
 * The message header is 10 bytes:
 * byte 0:      UInt8 must always be 0. This is the current version of the header which we support.
 * byte 1:      UInt8 length of action (A)
 * byte 2-5:    message ID
 * byte 6-9:    UInt32LE total length of message following from here after the action field (L).
 *
 * The message body follows right afterwards:
 * byte 10+A:   utf8 encoded action
 * byte +L:     N objects
 *
 * After the message initial header, there can be N objects.
 * Each object has its own object header.
 * The total length given in the message header (L) is the sum of all objects including their headers, but not the message header it self.
 *
 * The object header is 4 bytes:
 * byte 0:      UInt8 the data type: see TYPE_ constants for details
 * byte 1:      UInt8 length of key
 * byte 2-3:    UInt16LE length of data
 *
 * The object body follows with key and data:
 * byte 4-x:    utf8 encoded buffer of key
 * byte x-y:    object data
 *
 * Total length given in the message header (L) can then be defined as:
 * L = (number of objects * object header length) + all objects key and data body
 *
 * If an object key is prefixed by the '^' character, then the object is associated with the previously encoded object (last object). During decoding the associated objects are expected to be attached to that last object (hierarchy).
 * If an object key is suffixed by the "[]" characters, then the object is attached to an array named after the key.
 * If there was no previous object then the decoding is aborted.
 */

/**
 * Hash utility is required to generate crytographically strong pseudo-random strings
 * @requires ../util/hash
 */
const Hash = require("../util/hash");

// Native NodeJS dependencies
const assert = require("assert");

/**
 * Maximum message size in bytes.
 * This setting is intended to disallow messages larger than 1 MiB (total all objects together including all frames).
 * @constant
 * @type {number}
 * @default
 */
const MAX_MESSAGE_SIZE = 1024 * 1024;

/**
 * Maximum object data size in bytes.
 * This setting is intended to disallow objects larger than 64 KiB.
 * The full object will maximum be MAX_OBJECT_DATA_SIZE + OBJECT_FRAME_LENGTH + KEY_LENGTH;
 * @constant
 * @type {number}
 * @default
 */
const MAX_OBJECT_DATA_SIZE  = 1024 * 64 - 1;

/**
 * Maximum action and message ids key length size in bytes.
 * Considers data in their binary version.
 * @constant
 * @type {number}
 * @default
 */
const KEY_LENGTH = 255;

/**
 * Message id length in bytes.
 * @constant
 * @type {number}
 * @default
 */
const MESSAGE_ID_LENGTH = 4;

/**
 * Message frame length in bytes (header)
 * Composed of:
 *  type: uint8
 *  action length: uint8
 *  msg id: uint32le
 *  message length: uint32le
 * @constant
 * @type {number}
 * @default
 */
const MESSAGE_FRAME_LENGTH = 1 + 1 + MESSAGE_ID_LENGTH + 4;

/**
 * Object frame length in bytes (header)
 * Composed of:
 *  type: uint8
 *  key length: uint8
 *  data length: uint16
 * @constant
 * @type {number}
 * @default
 */
const OBJECT_FRAME_LENGTH = 1 + 1 + 2;

/**
 * Binary object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_BINARY       = 0;

/**
 * Boolean object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_BOOLEAN      = 1;

/**
 * 8-bit unsigned integer object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_UINT8        = 2;

/**
 * 8-bit signed integer object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_INT8         = 3;

/**
 * 16-bit unsigned integer object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_UINT16       = 4;

/**
 * 16-bit signed integer object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_INT16        = 5;

/**
 * 32-bit unsigned integer object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_UINT32       = 6;

/**
 * 32-bit signed integer object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_INT32        = 7;

/**
 * Null object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_NULL         = 8;

/**
 * UTF-8 object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_UTF8STRING   = 30;

/**
 * Number as string object type
 * Floats and very large integers are represented in their textual form
 * @constant
 * @type {number}
 * @default
 */
const TYPE_TEXTNUMBER   = 31;

/**
 * JSON object type
 * @constant
 * @type {number}
 * @default
 */
const TYPE_JSON         = 32;

/**
 * MessageEncoder
 */
class MessageEncoder
{
    /**
     * Create a new message.
     * @param {string} messageAction - Used for routing at receiving end.
     *  If set to existing msgId on receiver's end then it is a reply message. Maximum length is defined by KEY_LENGTH.
     * @param {string} [messageId] - message identifier in hexadecimal format. Expected length is defined by MESSAGE_ID_LENGTH.
     * @throws A TypeError will be thrown if messageAction or messageId are not a string or another type appropriate for Buffer.from() variants.
     *  An error message will be thrown if the messageAction length exceeds KEY_LENGTH.
     *  An error is expected to be thrown if there is a problem generating the random hexadecimal messageId, when none is provided.
     *  An error message will be thrown if the messageId doesn't match the format specifications.
     *  An error message will be thrown if the messageId length exceeds MESSAGE_ID_LENGTH.
     */
    constructor(messageAction, messageId)
    {
        this.messageAction = Buffer.from(messageAction, "utf8");
        if (this.messageAction.length > KEY_LENGTH) {
            throw `Message action length ${this.messageAction.length} exceeds maximum allowed length of ${KEY_LENGTH} bytes.`;
        }

        messageId = messageId || Hash.generateRandomHex(MESSAGE_ID_LENGTH);

        if (messageId.toLowerCase() !== messageId) {
            throw "Message ID must be provided as lowercase hexadecimal string.";
        }

        this.messageId = Buffer.from(messageId, "hex");

        if (this.messageId.length !== MESSAGE_ID_LENGTH) {
            throw `Message id length ${this.messageId.length} does not match expected length of ${MESSAGE_ID_LENGTH} bytes.`;
        }

        this.buffers = [];
    }

    /**
     * Return the hex message ID set in the constructor or auto generated by the constructor.
     * @return {string} message ID in hex format
     */
    getMsgId()
    {
        assert(this.messageId, "Expecting messageId to have been set in the constructor");
        return this.messageId.toString("hex");
    }

    /**
     * Add any serializable value, including null (added as string).
     * Do not put any data types other than: null, string, number, boolean, object, Array and Buffer.
     * Arrays must also only include fundamental data types.
     * Objects can have attached Buffers, same principle as when calling addObject().
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {null | string | number | boolean | Array | Buffer | object} any - fundamental data types in addition to Buffer and Array
     * @throws An exception will be thrown if the input data (any) is not in a valid data type.
     *  Errors are expected to be thrown by the allowed data type processors when either the key or the value (any) are not in the expected type format.
     */
    add(key, any)
    {
        const typeOfAny = typeof any;

        if (any === null || typeof any === "string") {
            this.addString(key, any);
        }
        else if (typeOfAny === "number") {
            this.addNumber(key, any);
        }
        else if (typeOfAny === "boolean") {
            this.addBoolean(key, any);
        }
        else if (Array.isArray(any)) {
            this.addArray(key, any);
        }
        else if (any instanceof Buffer) {
            this.addBinary(key, any);
        }
        else if (typeOfAny === "object") {
            this.addObject(key, any);
        }
        else {
            throw `Could not add object of type ${typeOfAny} for key "${key}", only fundamental data types allowed.`;
        }
    }

    /**
     * Add serializable Buffer data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {Buffer} buffer - Buffer data to be added.
     * @throws Errors are expected to be thrown when either the key or the value are not in the expected type format.
     *  An exception will be thrown when buffer data length is greater than MAX_OBJECT_DATA_SIZE.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addBinary(key, buffer)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if (buffer === undefined || buffer === null || !(buffer instanceof Buffer)) {
            throw "Expecting Buffer";
        }

        const objectHeader = this._createObjectHeader(TYPE_BINARY, buffer.length, key);
        this.buffers.push(objectHeader);
        this.buffers.push(buffer);
    }

    /**
     * Add serializable null data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @throws Errors are expected to be thrown when the key is not in the expected type format.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addNull(key)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        const buffer = Buffer.from("");
        const objectHeader = this._createObjectHeader(TYPE_NULL, buffer.length, key);
        this.buffers.push(objectHeader);
        this.buffers.push(buffer);
    }

    /**
     * Add serializable string data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {string | null} string - String encoded in UTF-8 to be added.
     * @throws Errors are expected to be thrown when either the key or the string value are not in the expected type format.
     *  An exception will be thrown when the buffer data length created from the input string is greater than MAX_OBJECT_DATA_SIZE.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addString(key, string)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if (string === null) {
            this.addNull(key);
        } else {
            if (string === undefined || !(typeof string === "string")) {
                throw "Expecting string";
            }

            const buffer = Buffer.from(string, "utf8");
            const objectHeader = this._createObjectHeader(TYPE_UTF8STRING, buffer.length, key);
            this.buffers.push(objectHeader);
            this.buffers.push(buffer);
        }
    }

    /**
     * Add serializable number data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {number | null} number - Number data to be added.
     * @throws Errors are expected to be thrown when either the key or the value are not in the expected type format.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addNumber(key, number)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if (number === null) {
            this.addNull(key);
        } else {
            if (number === undefined || !(typeof number === "number")) {
                throw "Expecting number";
            }

            const [type, buffer] = this._packNumber(number);
            const objectHeader = this._createObjectHeader(type, buffer.length, key);
            this.buffers.push(objectHeader);
            this.buffers.push(buffer);
        }
    }

    /**
     * Add serializable boolean data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {boolean | null} boolean - Boolean data to be added.
     * @throws Errors are expected to be thrown when either the key or the value are not in the expected type format.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addBoolean(key, boolean)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if (boolean === null) {
            this.addNull(key);
        } else {
            if (boolean === undefined || !(typeof boolean === "boolean")) {
                throw "Expecting boolean";
            }

            const buffer = Buffer.alloc(1);
            buffer.writeUInt8(boolean ? 1 : 0);
            const objectHeader = this._createObjectHeader(TYPE_BOOLEAN, buffer.length, key);
            this.buffers.push(objectHeader);
            this.buffers.push(buffer);
        }
    }

    /**
     * Add serializable array data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {Array} array - Array data to be added.
     * @throws Errors are expected to be thrown when either the key or the value are not in the expected type format.
     *  An exception will be thrown when the array contains data other than primitive data types.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addArray(key, array)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if (array === undefined || array === null || !(Array.isArray(array))) {
            throw "Expecting Array";
        }

        // Allow the addition of array only when elements include primitive data types
        if(array.length > 0) {
            if(array.some(data => (data !== null && typeof data != "string" && typeof data != "number" && typeof data != "boolean" && typeof data != "object"))) {
                throw "Could not add array, only fundamental data types allowed.";
            }
        }

        this.addJSON(key, JSON.stringify(array));
    }

    /**
     * Add an object and also extract any Buffer objects and place them as binaries.
     *
     * NOTE: Only buffer attached directly to object will be parsed, any nested buffers
     * will be missed and serialized in ways which we this class cannot restore, so do not do that.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {Object | null} object - Object data to be added.
     * @throws Errors are expected to be thrown when either the key or the value are not in the expected type format.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addObject(key, object)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if (object === null) {
            this.addNull(key);
        } else {
            if (object === undefined || !(typeof object === "object" && Array.isArray(object) === false)) {
                throw "Expecting Object";
            }

            // Filter out the Buffer objects and add them as binaries.
            const buffers = [];
            const object2 = {};
            Object.keys(object).forEach( key => {
                const value = object[key];
                if (value instanceof Buffer) {
                    buffers.push([key, value]);
                }
                else {
                    object2[key] = value;
                }
            });

            this.addJSON(key, JSON.stringify(object2));

            buffers.forEach( tuple => {
                const [key, buffer] = tuple;
                this.addBinary(`^${key}`, buffer);
            });
        }
    }

    /**
     * Adds a complex object which is in the same format as the return when unpacking a message's props.
     *
     * The foreseen use case is to use this function to create a new message from an existing message's data.
     * At the top level of the object arrays will be broken down into separate objects.
     *
     * @param {Object} object - complex data
     * @throws Exceptions are expected to be thrown by add when either the key or the value specified in the object are not in the expected type format.
     */
    addProps(object)
    {
        Object.keys(object).forEach( key => {
            const value = object[key];
            if (Array.isArray(value)) {
                if (value.length === 0) {
                    // Empty array we need to handle like JSON otherwise it won't exist.
                    this.addJSON(key, JSON.stringify([]));
                }
                else {
                    value.forEach( value => {
                        this.add(`${key}[]`, value);
                    });
                }
            }
            else {
                this.add(key, value);
            }
        });
    }

    /**
     * Add serializable JSON data.
     *
     * @param {string} key - prefix key with a "^" to put it on the previously added object as an attribute rather than on the top object. If an object key is suffixed with "[]", then the object is attached to an array named after the key.
     * @param {string | Buffer} json - JSON data to be added.
     * @throws Errors are expected to be thrown when either the key or the JSON value are not in the expected type format.
     *  An exception will be thrown when the buffer data length created from the input JSON data is greater than MAX_OBJECT_DATA_SIZE.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     */
    addJSON(key, json)
    {
        if (typeof key !== "string") {
            throw "Key must be string";
        }

        if ((json === undefined || json === null) || (typeof json !== "string" && !(json instanceof Buffer))) {
            throw "Expecting JSON string or Buffer";
        }

        const buffer = (typeof json === "string") ? Buffer.from(json, "utf8") : json;
        const objectHeader = this._createObjectHeader(TYPE_JSON, buffer.length, key);
        this.buffers.push(objectHeader);
        this.buffers.push(buffer);
    }

    /**
     * Calculate the length of the packed message (when it is packed).
     * Can be used to limit additions to keep a message within a given size before packing it.
     * @return {number} - The current message length
     */
    getCurrentLength()
    {
        let length = 0;
        this.buffers.forEach( buffer => length = length + buffer.length + OBJECT_FRAME_LENGTH + KEY_LENGTH);
        length = length + MESSAGE_FRAME_LENGTH + KEY_LENGTH;
        return length;
    }

    /**
     * Return the available space left in the message for one added object.
     * Note that the value can be greater than the allowed size for a single object.
     * @return {number} - The remaining length available for this message
     */
    getAvailableLength()
    {
        return MAX_MESSAGE_SIZE - this.getCurrentLength() - OBJECT_FRAME_LENGTH - KEY_LENGTH;
    }

    /**
     * Return array of buffers representing the whole message.
     *
     * @return {Array<Buffer>}
     * @throws An exception will be thrown when the resulting message length is bigger than MAX_MESSAGE_SIZE.
     */
    pack()
    {
        // Create a new array of buffers to keep the original this.buffers data intact
        const buffers = this.buffers.slice();
        buffers.unshift(this._createMessageHeader());
        return buffers;
    }

    /**
     * Figure out number type and pack it.
     * Large numbers over 32 bit, floats and strings are packed in textual form.
     *
     * @param {number | string} n - number to be packed
     * @return {Array<number, Buffer>}
     */
    _packNumber(n)
    {
        let type;
        let buffer;

        const isFloat = n !== Math.floor(n);
        let asTextual = false;
        if (isFloat) {
            // Float we pack as textual
            asTextual = true;
        }
        else if (n >= 0) {
            if (n < (2**8)) {
                type = TYPE_UINT8;
                buffer = Buffer.alloc(1);
                buffer.writeUInt8(n);
            }
            else if (n < (2**16)) {
                type = TYPE_UINT16;
                buffer = Buffer.alloc(2);
                buffer.writeUInt16LE(n);
            }
            else if (n < (2**32)) {
                type = TYPE_UINT32;
                buffer = Buffer.alloc(4);
                buffer.writeUInt32LE(n);
            }
            else {
                // Large number
                // Pack as textual
                asTextual = true;
            }
        }
        else {
            if (n >= -(2**7)) {
                type = TYPE_INT8;
                buffer = Buffer.alloc(1);
                buffer.writeInt8(n);
            }
            else if (n >= -(2**15)) {
                type = TYPE_INT16;
                buffer = Buffer.alloc(2);
                buffer.writeInt16LE(n);
            }
            else if (n >= -(2**31)) {
                type = TYPE_INT32;
                buffer = Buffer.alloc(4);
                buffer.writeInt32LE(n);
            }
            else {
                // Large negative number
                // Pack as textual
                asTextual = true;
            }
        }

        if (asTextual) {
            const nStr = String(n);
            type = TYPE_TEXTNUMBER;
            buffer = Buffer.from(nStr);
        }

        return [type, buffer];
    }

    /**
     * Create a new object header based on object type, length and key.
     *
     * @param {number} objectType - a valid object type (TYPE_*)
     * @param {number} length - object length
     * @param {string} key - object key
     * @throws A TypeError will be thrown if key is not a string or another type appropriate for Buffer.from() variants.
     *  An exception will be thrown when key length is bigger than KEY_LENGTH.
     *  An exception will be thrown when the length parameter is greater than MAX_OBJECT_DATA_SIZE.
     * @return {Buffer} - object header
     */
    _createObjectHeader(objectType, length, key)
    {
        if (!key || key == "") {
            throw `Key must be provided.`;
        }
        const keyBuf = Buffer.from(key, "utf8");
        if (!keyBuf || keyBuf.length > KEY_LENGTH) {
            throw `Key length ${keyBuf.length} must be string of maximum ${KEY_LENGTH} bytes.`;
        }
        if (length > MAX_OBJECT_DATA_SIZE) {
            throw `Too large object length ${length} for key \"${key}\", max size is ${MAX_OBJECT_DATA_SIZE} bytes for object data in a message.`;
        }
        const keyLength = keyBuf.length;
        const objectHeader = Buffer.alloc(OBJECT_FRAME_LENGTH + keyLength);
        let pos = 0;
        objectHeader.writeUInt8(objectType, pos);
        pos = pos + 1;
        objectHeader.writeUInt8(keyLength, pos);
        pos = pos + 1;
        objectHeader.writeUInt16LE(length, pos);
        pos = pos + 2;
        keyBuf.copy(objectHeader, pos);

        return objectHeader;
    }

    /**
     * Create a new message header.
     *
     * @throws An exception will be thrown if the message length is bigger than MAX_MESSAGE_SIZE.
     * @return {Buffer} - message header
     */
    _createMessageHeader()
    {
        let messageLength = 0;
        this.buffers.forEach( buffer => messageLength = messageLength + buffer.length );

        const actionLength = this.messageAction.length;

        // We deduct the message header so that we can guarantee message is maximum MAX_MESSAGE_SIZE
        if (messageLength > MAX_MESSAGE_SIZE - MESSAGE_FRAME_LENGTH - actionLength) {
            throw `Message length ${messageLength} overflows max size of ${MAX_MESSAGE_SIZE} bytes.`;
        }

        const messageHeader = Buffer.alloc(MESSAGE_FRAME_LENGTH + actionLength);
        let pos = 0;
        messageHeader.writeUInt8(0, pos);
        pos = pos + 1;
        messageHeader.writeUInt8(actionLength, pos);
        pos = pos + 1;
        this.messageId.copy(messageHeader, pos);
        pos = pos + 4;
        messageHeader.writeUInt32LE(messageLength, pos);
        pos = pos + 4;
        this.messageAction.copy(messageHeader, pos);
        pos = pos + actionLength;

        return messageHeader;
    }
}

class MessageDecoder
{
    /**
     * @param {Array<Buffer>} buffers
     */
    constructor(buffers)
    {
        this.buffers = buffers;
        this.position = 0;
        this.messageId = null;
        this.action = null;
        this.length = null;
    }

    /**
     * Initialize the unpacking of the message.
     * Tries to decode the initial message header.
     * Note: If the init fails, try again when more data has arrived.
     *
     * @throws Exception is thrown when object has already been initialized.
     * @return {boolean} true if successful.
     */
    init()
    {
        if (this.length != null) {
            throw "Cannot run init() more than once when unpacking.";
        }

        const buffer = this._readData(this.position, MESSAGE_FRAME_LENGTH);
        if (!buffer) {
            return false;
        }

        let pos = 0;

        if (buffer.readUInt8(pos) !== 0) {
            // First byte must be zero, this dictates our current formatting version of a message.
            return false;
        }
        pos = pos + 1;
        const actionLength = buffer.readUInt8(pos);
        pos = pos + 1;
        const messageId = buffer.slice(pos, pos + 4);
        pos = pos + 4;
        const length = buffer.readUInt32LE(pos);
        pos = pos + 4;
        assert(pos == MESSAGE_FRAME_LENGTH, "Expecting pos manipulation to match message frame length");

        const actionBuffer = this._readData(this.position + pos, actionLength);
        if (!actionBuffer) {
            return false;
        }

        this.messageId = messageId
        this.length = length;
        this.action = actionBuffer.toString("utf8");
        pos = pos + actionLength;

        this.position = this.position + pos;

        return true;
    }

    /**
     * Check if we have a full message in the buffers.
     * @throws Exception is thrown when object has not been initialized.
     * @return {boolean} true if there is a full message to be decoded.
     */
    isReady()
    {
        if (this.length == null) {
            throw "Cannot run isReady() before init() has successfully been called.";
        }

        return this.getLength() <= this._getRemainingLength();
    }

    /**
     * Unpack a full message from the buffers.
     * Depends on that init() has been called first and that all the message data is in the buffers.
     *
     * @throws Exception is thrown when object has not been previously initialized.
     * @throws Exception is thrown when a failure occurs during the message unpacking process, such as errors during parsing.
     * @throws Exception is thrown when an unexpected data type is present in the message to be unpacked.
     * @return {Array<{string | null} action, {string | null} messageId, {Object} props> | null}
     *  action is the given action or the message ID if the message is a reply message.
     *  messageId is the message's ID.
     *  props are the object containing the key value properties.
     *  Returns null on error.
     */
    unpack()
    {
        if (this.isReady() === false) {
            return null;
        }

        let lastObject = null;
        let props = {};
        const startPos = this.position;
        try {
            while (this.position - startPos < this.getLength() && this._hasNext()) {
                const [type, key1, buffer] = this._next();
                const target = key1.startsWith("^") ? lastObject : props;

                if (!target) {
                    throw `Key ${key1} is pointing to last object, but there is no last object.`;
                }

                const key = key1.startsWith("^") ? key1.slice(1) : key1;

                let object;
                if (type === TYPE_BINARY) {
                    object = buffer;
                }
                else if (type === TYPE_UTF8STRING) {
                    object = buffer.toString("utf8");
                }
                else if (type === TYPE_BOOLEAN) {
                    object = buffer.readUInt8() === 0 ? false : true;
                }
                else if (type === TYPE_INT8) {
                    object = buffer.readInt8();
                }
                else if (type === TYPE_UINT8) {
                    object = buffer.readUInt8();
                }
                else if (type === TYPE_INT16) {
                    object = buffer.readInt16LE();
                }
                else if (type === TYPE_UINT16) {
                    object = buffer.readUInt16LE();
                }
                else if (type === TYPE_INT32) {
                    object = buffer.readInt32LE();
                }
                else if (type === TYPE_UINT32) {
                    object = buffer.readUInt32LE();
                }
                else if (type === TYPE_NULL) {
                    object = null;
                }
                else if (type === TYPE_TEXTNUMBER) {
                    object = Number(buffer.toString());
                }
                else if (type === TYPE_JSON) {
                    try {
                        object = JSON.parse(buffer);
                    }
                    catch(e) {
                        throw "Cannot parse JSON data.";
                    }
                    if (object && typeof object === "object" && Array.isArray(object) === false) {
                        lastObject = object;
                    }
                }
                else {
                    // Unknown type.
                    // Could be that the other end has other types it can encode to, such as BSON, etc.
                    throw "Unknown data type";
                }

                if (key.endsWith("[]")) {
                    const key2 = key.slice(0, -2);
                    const list = target[key2] || [];
                    target[key2] = list;
                    list.push(object);
                }
                else {
                    target[key] = object;
                }
            }
        }
        catch (e) {
            console.error("Could not unpack message:", e);
            props = null;
        }

        this._drain();

        if (props) {
            return [this._getAction(), this._getId(), props];
        }
        return null;
    }

    /**
     * @returns the current total length of the buffers in the array.
     */
    _getBuffersLength()
    {
        let count = 0;
        if (this.buffers) {
            this.buffers.forEach( buffer => count = count + buffer.length );
        }
        return count;
    }

    /**
     * @return the length which is remaining in the buffers after the current position.
     */
    _getRemainingLength()
    {
        assert(this.position >= 0, "Expecting this.position to be a positive number");
        return this._getBuffersLength() - this.position;
    }

    /**
     * Read data from the buffers.
     *
     * @param {number} position - offset to start reading from.
     * @param {number} length - total length to be read, in bytes.
     * @returns On success, Buffer containing the data.
     *  On error, returns null.
     */
    _readData(position, length)
    {
        if (!this.buffers) {
            return null;
        }

        let ret = Buffer.alloc(0);
        let bytesToRead = length;
        let index = 0;
        while (bytesToRead > 0) {
            const buffer = this.buffers[index];
            if (!buffer) {
                return null;
            }
            if (position >= buffer.length) {
                position = position - buffer.length;
                index++;
                continue;
            }
            const l = Math.min(bytesToRead, buffer.length - position);
            ret = Buffer.concat([ret, buffer.slice(position, position + l)]);
            position = 0;
            bytesToRead -= l;
            index++;
        }
        if (ret.length < length) {
            return null;
        }
        return ret;
    }

    /**
     * Retrieves the next object available in the buffers.
     * Note: This function expects there to be data available.
     *
     * @returns the next object in the message buffers.
     * On error, return null.
     */
    _next()
    {
        const buffer = this._readData(this.position, OBJECT_FRAME_LENGTH);
        if (!buffer) {
            return null;
        }

        const objectType = buffer.readUInt8();
        let pos = 1;

        const keyLength = buffer.slice(pos, pos + 1).readUInt8();
        pos = pos + 1;

        const objectLength = buffer.slice(pos, pos + 2).readUInt16LE();
        pos = pos + 2;

        assert(pos == OBJECT_FRAME_LENGTH, "Expecting pos manipulation to match object frame length");

        const keyBuffer = this._readData(this.position + pos, keyLength);
        if (!keyBuffer) {
            return null;
        }

        const key = keyBuffer.toString("utf8");
        pos = pos + keyLength;

        this.position = this.position + pos;

        const data = this._readData(this.position, objectLength);
        this.position = this.position + objectLength;
        return [objectType, key, data];
    }

    /**
     * Check if we have a full object to be decoded.
     *
     * @return {boolean}
     */
    _hasNext()
    {
        const buffer = this._readData(this.position, OBJECT_FRAME_LENGTH);
        if (!buffer) {
            return false;
        }
        const keyLength = buffer.slice(1, 2).readUInt8();
        const objectLength = buffer.slice(2, 4).readUInt16LE();
        const diff = this._getRemainingLength() - (keyLength + objectLength + OBJECT_FRAME_LENGTH);
        return diff >= 0;
    }

    /**
     * Return the action of the message header.
     * @return {string | null}
     */
    _getAction()
    {
        return this.action;
    }

    /**
     * Return the message id of the message header in hex format.
     * @return {string | null}
     */
    _getId()
    {
        let id = null;
        if(this.messageId) {
            id = this.messageId.toString("hex");
        }
        return id;
    }

    /**
     * Return the message length given in the message header.
     * @return {number | null}
     */
    getLength()
    {
        return this.length;
    }

    /**
     * Drain from the buffers up til the current position and reset the position.
     */
    _drain()
    {
        assert(this.buffers, "Expecting this.buffers to have been previously initialized");
        assert(this.buffers[0], "Expecting this.buffers[0] to have been filled before");

        let bytesToDrain = this.position;
        while (bytesToDrain > 0) {
            const l = this.buffers[0].length;
            if (bytesToDrain >= l) {
                this.buffers.shift();
                bytesToDrain -= l;
                continue;
            }
            this.buffers[0] = this.buffers[0].slice(bytesToDrain);
            bytesToDrain = 0;
        }
        this.position = 0;
    }
}

module.exports =
{
    MessageEncoder, MessageDecoder,
    MAX_MESSAGE_SIZE, MAX_OBJECT_DATA_SIZE, KEY_LENGTH, MESSAGE_FRAME_LENGTH, OBJECT_FRAME_LENGTH, MESSAGE_ID_LENGTH,
    TYPE_UINT8, TYPE_INT8, TYPE_UINT16, TYPE_INT16, TYPE_UINT32, TYPE_INT32, TYPE_TEXTNUMBER, TYPE_UTF8STRING
};
