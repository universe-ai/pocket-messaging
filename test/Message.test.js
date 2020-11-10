#!/usr/bin/env node

//TODO: FIXME: unused ?
/*const {BlobFactory,
    Blob,
    BlobPending,
    BlobPendingSignature} = require("../datamodel/Blob");*/

//TODO: FIXME: unused ?
/*
const {NodeFactory,
    Node,
    NodePending,
    NodePendingSignature} = require("../datamodel/Node");*/

//TODO: FIXME: unused ?
//const Receipt = require("../datamodel/Receipt");
//TODO: FIXME: unused ?
//const Buf = require("../util/buf.js");
//TODO: FIXME: unused ?
//const ed25519 = require("../util/ed25519");
const
{
    MessageDecoder, MessageEncoder,
    MAX_MESSAGE_SIZE, MAX_OBJECT_DATA_SIZE, KEY_LENGTH, MESSAGE_FRAME_LENGTH, OBJECT_FRAME_LENGTH,
    TYPE_UINT8, TYPE_INT8, TYPE_UINT16, TYPE_INT16, TYPE_UINT32, TYPE_INT32, TYPE_TEXTNUMBER, TYPE_UTF8STRING
} = require("../Message.js");
const assert = require("assert");
const crypto = require("crypto");

function test_constructor()
{
    let newMessage = null;

    // Missing required message action
    assert.throws(() => new MessageEncoder(), /TypeError \[ERR_INVALID_ARG_TYPE\]/);

    // Message action length exceeds limits by 1 byte
    const messageActionExceededLength = crypto.randomBytes(1024).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => new MessageEncoder(messageActionExceededLength), /Message action length 256 exceeds maximum allowed length of 255 bytes./);

    // Valid message action
    const messageAction = crypto.randomBytes(1024).toString("ascii").slice(0, KEY_LENGTH);
    newMessage = new MessageEncoder(messageAction);
    assert(newMessage.messageAction.toString("utf8") == messageAction);

    // Message id is not lower case hexadecimal
    const messageIdMixedCase = "aBCd12EF";
    assert.throws(() => new MessageEncoder(messageAction, messageIdMixedCase), /Message ID must be provided as lowercase hexadecimal string./);

    // Message id length is too short: [1, 3]
    const messageIdShort = crypto.randomBytes(Math.floor(Math.random() * 3)+1).toString("hex");
    assert.throws(() => new MessageEncoder(messageAction, messageIdShort), /Message id length [0-9] does not match expected length of 4 bytes./)

    // Message id length is too long: [4, 1024]
    const messageIdLong = crypto.randomBytes(Math.floor(Math.random() * 1024)+4).toString("hex");
    assert.throws(() => new MessageEncoder(messageAction, messageIdLong), /Message id length .* does not match expected length of 4 bytes./);

    // Valid message id
    const messageId = "abcd12ef";
    newMessage = new MessageEncoder(messageAction, messageId)
    assert(newMessage.messageId.toString("hex") == messageId);

    // Valid random message id
    const messageIdRandom = crypto.randomBytes(4).toString("hex");
    newMessage = new MessageEncoder(messageAction, messageIdRandom)
    assert(newMessage.messageId.toString("hex") == messageIdRandom);

    // Check message data starts out empty
    assert(newMessage.buffers instanceof Array);
    assert(newMessage.buffers.length == 0);
}

function test_getMsgId()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)
    assert(message.getMsgId() == messageId);
}

function test_add()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.add(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.add("data is undefined", undefined), /Could not add object of type undefined, only fundamental data types allowed./);
    assert.throws(() => message.add("data is unsupported Array", [ function(){}, function(){}, function(){} ]), /Could not add array, only fundamental data types allowed./);
    assert.throws(() => message.add("data is function", function(){}), /Could not add object of type function, only fundamental data types allowed./);

    // Valid
    assert.doesNotThrow(() => message.add("data is null", null));
    assert.doesNotThrow(() => message.add("data is string", "a string"));
    assert.doesNotThrow(() => message.add("data is number", 10));
    assert.doesNotThrow(() => message.add("data is boolean", true));
    assert.doesNotThrow(() => message.add("data is array", [123, "abc", 4.67, "fg"]));
    assert.doesNotThrow(() => message.add("data is Buffer", Buffer.from("a string")));
    assert.doesNotThrow(() => message.add("data is object", { "a string": 10}));
}

function test_addBinary()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addBinary(0, Buffer.from("key is not a string")), /Key must be string/);
    assert.throws(() => message.addBinary("data is not Buffer", undefined), /Expecting Buffer/);
    assert.throws(() => message.addBinary("data is not Buffer", null), /Expecting Buffer/);
    assert.throws(() => message.addBinary("data is not Buffer", "a string"), /Expecting Buffer/);
    assert.throws(() => message.addBinary("data is big Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE+1)), /Too large object length 65536 for key "data is big Buffer", max size is 65535 bytes for object data in a message./);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addBinary(bigKey, Buffer.from("the key is big")), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addBinary("data is Buffer", Buffer.from("a string")));
    assert.doesNotThrow(() => message.addBinary("data is empty Buffer", Buffer.alloc(0)));

    // Check binary added was in the form of a new object
    assert(message.buffers.length == (2*(1 + 1))); // (header + data)
}

function test_addNull()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addNull(0), /Key must be string/);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addNull(bigKey), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addNull("data is null"));

    // Check strings were added in the form of new objects
    assert(message.buffers.length == (1*(1 + 1))); // 1 objects * (header + empty but existing data)
}

function test_addString()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addString(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.addString("data is not string", undefined), /Expecting string/);
    const bigString = crypto.randomBytes(MAX_OBJECT_DATA_SIZE+1).toString("ascii").slice(0, MAX_OBJECT_DATA_SIZE+1);
    assert.throws(() => message.addString("data is big string", bigString), /Too large object length 65536 for key "data is big string", max size is 65535 bytes for object data in a message./);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addString(bigKey, "the key is big"), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addString("data is an empty string", null));
    assert.doesNotThrow(() => message.addString("data is empty string", ""));
    assert.doesNotThrow(() => message.addString("data is a string", "a string"));

    // Check strings were added in the form of new objects
    assert(message.buffers.length == (1*(1 + 1) + 2*(1 + 1))); // 1 null header, empty but existing data + 2 objects * (header + data)
}

function test_addNumber()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addNumber(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.addNumber("data is not number", undefined), /Expecting number/);
    assert.throws(() => message.addNumber("data is not number", null), /Expecting number/);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addNumber(bigKey, 1024), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addNumber("data is a number", 1024));
    assert.doesNotThrow(() => message.addNumber("data is a float", 2.1024));
    assert.doesNotThrow(() => message.addNumber("data is a big", Number.MAX_SAFE_INTEGER));
    assert.doesNotThrow(() => message.addNumber("data is a big float", Number.MAX_VALUE));

    // Check numbers were added in the form of new objects
    assert(message.buffers.length == (4*(1 + 1))); // 4 objects * (header + data)
}

function test_addBoolean()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addBoolean(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.addBoolean("data is not boolean", undefined), /Expecting boolean/);
    assert.throws(() => message.addBoolean("data is not boolean", null), /Expecting boolean/);
    assert.throws(() => message.addBoolean("data is not boolean", 0), /Expecting boolean/);
    assert.throws(() => message.addBoolean("data is not boolean", 1), /Expecting boolean/);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addBoolean(bigKey, true), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addBoolean("data is a boolean", true));
    assert.doesNotThrow(() => message.addBoolean("data is a boolean", false));

    // Check booleans were added in the form of new objects
    assert(message.buffers.length == (2*(1 + 1))); // 2 objects * (header + data)
}

function test_addArray()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addArray(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.addArray("data is not array", undefined), /Expecting Array/);
    assert.throws(() => message.addArray("data is not array", null), /Expecting Array/);
    assert.throws(() => message.addArray("data array contains data other than primitive not data types", [ 1, "abc", function(){}]), /Could not add array, only fundamental data types allowed./);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addArray(bigKey, [true]), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addArray("data is array of nulls", [null, null, null]));
    assert.doesNotThrow(() => message.addArray("data is array of strings", ["a", "b", "c"]));
    assert.doesNotThrow(() => message.addArray("data is array of numbers", [1, 2, 3, 4, 5]));
    assert.doesNotThrow(() => message.addArray("data is array of booleans", [true, false, false]));
    assert.doesNotThrow(() => message.addArray("data is array of objects", [{"a": 1}, {"b": 2}, {"c": 3}]));
    assert.doesNotThrow(() => message.addArray("data is mixed array", [null, "a", 1, true, {"b": 22}]));

    // Check arrays were added in the form of new objects
    assert(message.buffers.length == (6*(1 + 1))); // 6 objects * (header + data)
}

function test_addObject()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Invalid
    assert.throws(() => message.addObject(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.addObject("data is not object", undefined), /Expecting Object/);
    assert.throws(() => message.addObject("data is not object", null), /Expecting Object/);
    assert.throws(() => message.addObject("data is not object", []), /Expecting Object/);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addObject(bigKey, {}), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addObject("data is object", {"a": 1, "b": 2, "c": 3}));
    assert.doesNotThrow(() => message.addObject("data is object containing one Buffer", {"d": 4, "e": Buffer.from("5"), "f": 6, }));

    // Check objects were added
    assert(message.buffers.length == (3*(1 + 1))); // 2 objects * (header + data) + 1 Buffer
}

function test_addProps()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)
    const object = [
        "myComplexAction",
        "deadbeef",
        {
            name: "Ridge Raft",
            data1: Buffer.alloc(100).fill(1),
            data2: Buffer.alloc(200).fill(2)
        }
    ];
    const objectProps = object[2];

    // Invalid
    assert.throws(() => message.addProps({"name": undefined}), /Could not add object of type undefined, only fundamental data types allowed./);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    let objectWithBigKey = {};
    objectWithBigKey[bigKey] = {};
    assert.throws(() => message.addProps(objectWithBigKey), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addProps(objectProps));
    assert.doesNotThrow(() => message.addProps({"null is a string": null}));
    assert.doesNotThrow(() => message.addProps({"empty array is valid": []}));

    // Check numbers were added in the form of new objects
    assert(message.buffers.length == (3*(1 + 1) + 2*(1 + 1))); // 1 complex prop (3*2) + 2 props * (header + data)
}

function test_addJSON()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)
    const data = {"a": 1, "b": 2, "c": 3};
    const dataStr = JSON.stringify(data);
    const dataBuffer = Buffer.from(dataStr);

    // Invalid
    assert.throws(() => message.addJSON(0, "key is not a string"), /Key must be string/);
    assert.throws(() => message.addJSON("data is not JSON", undefined), /Expecting JSON string or Buffer/);
    assert.throws(() => message.addJSON("data is not JSON", null), /Expecting JSON string or Buffer/);
    assert.throws(() => message.addJSON("data is not JSON", []), /Expecting JSON string or Buffer/);
    assert.throws(() => message.addJSON("data is not JSON", {}), /Expecting JSON string or Buffer/);
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
    assert.throws(() => message.addJSON(bigKey, dataBuffer), /Key length 256 must be string of maximum 255 bytes./);

    // Check binary was never added
    assert(message.buffers.length == 0);

    // Valid
    assert.doesNotThrow(() => message.addJSON("data is JSON string", dataStr));
    assert.doesNotThrow(() => message.addJSON("data is JSON Buffer", dataBuffer));

    // Check objects were added
    assert(message.buffers.length == (2*(1 + 1))); // 2 objects * (header + data)
}

function test_getCurrentLength()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Unpacked message without buffers of objects
    assert(message.getCurrentLength() == MESSAGE_FRAME_LENGTH + KEY_LENGTH);

    // Add buffers of objects
    assert.doesNotThrow(() => message.addNumber("data is a number", 1));
    assert.doesNotThrow(() => message.addString("data is a string", "a"));

    // Unpacked
    assert(message.getCurrentLength() == MESSAGE_FRAME_LENGTH + KEY_LENGTH + 2 * (280 + OBJECT_FRAME_LENGTH + KEY_LENGTH) );
}

function test_getAvailableLength()
{
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Check there is space available
    assert(message.getAvailableLength() > 0);
    assert(message.getAvailableLength() < MAX_MESSAGE_SIZE);

    // Add buffers of objects
    assert.doesNotThrow(() => message.addNumber("data is a number", 1));
    assert.doesNotThrow(() => message.addString("data is a string", "a"));

    // Check there is space available
    assert(message.getAvailableLength() > 0);
    assert(message.getAvailableLength() < MAX_MESSAGE_SIZE);

    // Try to extrapolate buffers
    let i;
    for(i=0; i<15; i++) {
        assert.doesNotThrow(() => message.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
    }
    assert(message.getAvailableLength() > 0);
    assert(message.getAvailableLength() < MAX_MESSAGE_SIZE);

    // Verify there is no check
    assert.doesNotThrow(() => message.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
    assert(message.getAvailableLength() < 0);
}

function test_pack() {
    const messageAction = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    assert.doesNotThrow(() => message.add("data is string", "a string"));
    assert(message.buffers.length == (1*(1 + 1))); // 1 object * (header + data)

    // Successfully pack message
    const messagePack = message.pack();
    assert(Buffer.compare(messagePack[0], message._createMessageHeader()) == 0);
    assert(Buffer.compare(messagePack[1], message.buffers[0]) == 0);
    assert(Buffer.compare(messagePack[2], message.buffers[1]) == 0);

    // Extrapolate buffer usage
    let i;
    for(i=0; i<16; i++) {
        assert.doesNotThrow(() => message.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
    }

    // Fail to pack extrapolated message
    assert.throws(() => message.pack(), /Message length 1048874 overflows max size of 1048576 bytes./);
}

function test_packNumber() {
    const messageAction = crypto.randomBytes(10).toString("ascii");
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    let pack;
    // Float as string
    pack = message._packNumber("1.0");
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(pack[1].toString() === "1.0");

    // Integer as string
    pack = message._packNumber("1");
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(pack[1].toString() === "1");

    // Unsigned integer as string
    pack = message._packNumber("-1");
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(pack[1].toString() === "-1");

    // Float as number
    pack = message._packNumber(1.0);
    assert(pack[0] !== TYPE_TEXTNUMBER);
    pack = message._packNumber(1.23456789);
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(parseFloat(pack[1].toString()) === 1.23456789);
    pack = message._packNumber(123456789e-8);
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(parseFloat(pack[1].toString()) === 1.23456789);

    // uint8
    pack = message._packNumber(1);
    assert(pack[0] === TYPE_UINT8);
    assert(pack[1][0] === 1);

    // uint16
    pack = message._packNumber(65535);
    assert(pack[0] === TYPE_UINT16);
    assert(pack[1].readUInt16LE() === 65535);

    // uint32
    pack = message._packNumber(4294967295);
    assert(pack[0] === TYPE_UINT32);
    assert(pack[1].readUInt32LE() === 4294967295);

    // Big positive
    pack = message._packNumber(100000000000);
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(parseFloat(pack[1].toString()) === 100000000000);

    // int8
    pack = message._packNumber(-1);
    console.warn(pack[1].readInt8());
    assert(pack[0] === TYPE_INT8);
    assert(pack[1].readInt8() === -1);

    // int16
    pack = message._packNumber(-32767);
    assert(pack[0] === TYPE_INT16);
    assert(pack[1].readInt16LE() === -32767);

    // int32
    pack = message._packNumber(-2147483648);
    assert(pack[0] === TYPE_INT32);
    assert(pack[1].readInt32LE() === -2147483648);

    // Big negative
    pack = message._packNumber(-100000000000);
    assert(pack[0] === TYPE_TEXTNUMBER);
    assert(parseFloat(pack[1].toString()) === -100000000000);
}

function test_createObjectHeader() {
    const messageAction = crypto.randomBytes(10).toString("ascii");
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    const buffer = Buffer.from("data", "utf8");
    const key = "a key";
    const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);

    // Invalid
    assert.throws(() => message._createObjectHeader(TYPE_UTF8STRING, buffer.length, ""), /Key must be provided./);
    assert.throws(() => message._createObjectHeader(TYPE_UTF8STRING, buffer.length, null), /Key must be provided./);
    assert.throws(() => message._createObjectHeader(TYPE_UTF8STRING, buffer.length, undefined), /Key must be provided./);
    assert.throws(() => message._createObjectHeader(TYPE_UTF8STRING, buffer.length, bigKey), /Key length 256 must be string of maximum 255 bytes./);
    assert.throws(() => message._createObjectHeader(TYPE_UTF8STRING, MAX_OBJECT_DATA_SIZE+1, key), /Too large object length 65536 for key "a key", max size is 65535 bytes for object data in a message./);

    // Valid: Create header
    assert.doesNotThrow(() => message._createObjectHeader(TYPE_UTF8STRING, buffer.length, key));
}

function test_createMessageHeader() {
    const messageAction = crypto.randomBytes(10).toString("ascii");
    const messageId = crypto.randomBytes(4).toString("hex");
    const message = new MessageEncoder(messageAction, messageId)

    // Valid: Create header
    assert.doesNotThrow(() => message._createMessageHeader());

    // Invalid: extrapolate buffer usage and fail to create header
    let i;
    for(i=0; i<16; i++) {
        assert.doesNotThrow(() => message.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
    }
    assert.throws(() => message._createMessageHeader(), /Message length 1048848 overflows max size of 1048576 bytes./);
}

function test_decoder_constructor() {
    // Set up encoded message
    const messageAction = crypto.randomBytes(10).toString("ascii");
    const messageId = crypto.randomBytes(4).toString("hex");
    const messageDataKey = "data is a string";
    const messageDataValue = "a string";
    const message = new MessageEncoder(messageAction, messageId)
    assert.doesNotThrow(() => message.add(messageDataKey, messageDataValue));
    const messagePack = message.pack();

    // Create new decoder
    const decoder = new MessageDecoder(messagePack);
    assert(decoder.buffers.length == 3);
    assert(decoder.position == 0);
    assert(decoder.messageId == null);
    assert(decoder.action == null);
    assert(decoder.length == null);
}

function test_decoder_X() {
    // Set up encoded message
    const messageAction = crypto.randomBytes(10).toString("ascii");
    const messageId = crypto.randomBytes(4).toString("hex");
    const messageDataKey = "data is a string";
    const messageDataValue = "a string";
    const message = new MessageEncoder(messageAction, messageId)
    assert.doesNotThrow(() => message.add(messageDataKey, messageDataValue));
    const messagePack = message.pack();

    // Create new decoder
    const decoder = new MessageDecoder(messagePack);
console.warn(decoder);
    assert(decoder.init());
    assert(decoder.isReady());
    const messageDecoded = decoder.unpack();

    assert(messageDecoded[0] == messageAction);
    assert(messageDecoded[1] == messageId);
    assert(Object.keys(messageDecoded[2])[0] == messageDataKey);
    assert(messageDecoded[2][messageDataKey] == messageDataValue);
}


function test_basics()
{
    const ID_LENGTH = 16;
    const messageFrameLength = 1 + 4 + ID_LENGTH * 2;
    const objectFrameLength = 1 + 4 + ID_LENGTH;

    const buffers = [];
    const message = new MessageDecoder(buffers);
    assert(message.init() === false);

    const objectData = Buffer.alloc(32).fill(3);
    const messageAction = "hello";
    const messageId = "ABCDEFGH";

    const messageFrame = Buffer.alloc(messageFrameLength);

    // Write the message frame
    let pos = 0;
    messageFrame.writeUInt8(0, pos);
    pos = pos + 1;
    const messageLength = objectData.length + objectFrameLength;
    messageFrame.writeUInt32LE(messageLength, pos);
    pos = pos + 4;
    messageFrame.write(messageAction, pos);
    pos = pos + ID_LENGTH;
    messageFrame.write(messageId, pos);
    buffers.push(messageFrame);

    assert(message.init());
    assert(message.isReady() === false);

    // Write the object frame
    const objectKey = "data";
    const objectFrame = Buffer.alloc(objectFrameLength);
    pos = 0;
    objectFrame.writeUInt8(0, pos);
    pos = pos + 1;
    objectFrame.writeUInt32LE(objectData.length, pos);
    pos = pos + 4;
    objectFrame.write(objectKey, pos);
    pos = pos + ID_LENGTH;
    buffers.push(objectFrame);
    assert(message.isReady() === false);
    buffers.push(objectData);
    assert(message.isReady());

    const decoded = message.unpack();

    const newMessage = new MessageEncoder("myAction", "abba4e14");
    let packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 1);

    newMessage.addObject("person", {name: "McRaminov"});
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 3);

    newMessage.addBinary("data", Buffer.from("Enterprises"));
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 5);
}

function test_details()
{
    const a = Buffer.from("alpha");
    const b = Buffer.from("beta");
    const c = Buffer.from("gamma");
    const buffers = [a, b, c];
    const buffer = Buffer.concat(buffers);
    const length = buffer.length;

    let message = new MessageDecoder(buffers);
    assert(message._getBuffersLength() === length);
    message.position = 3;
    assert(message._getRemainingLength() === length - 3);
    message._drain();
    assert(message._getBuffersLength() === length - 3);
    assert(message._getBuffersLength() === message._getRemainingLength());
    const out = message._readData(0, message._getRemainingLength());
    assert(out.compare(buffer.slice(3)) === 0);

    const hex = "00a500000073796e6300000000000000000000000064336432613734630104000000646f53796e630000000000000000000074727565012200000062617463684964000000000000000000223530626339366538356438333335313661623138633831313365663338353238220108000000737562736372696265547970650000002273747265616d22012300000073796e63507265666572656e636573007b22626c6f624d696e496e646578223a302c22626c6f624d6178496e646578223a397d";
    const A = Buffer.from(hex, "hex");
    message = new MessageDecoder([A]);
    assert(message.init());
    assert(message.isReady());
    assert(message.getLength() === 165);
    const triple = message.unpack();
    assert(triple[0] === "sync");
    assert(triple[1] === "d3d2a74c");
    assert(triple[2]["doSync"] === true);
    //console.log(triple);

    // TODO: we could add even more boundaries testing to see that it behaves well passing
    // over different buffers.
}

function test_further()
{
    const newMessage = new MessageEncoder("myAction", "abba4e14");
    assert(newMessage._packNumber(0)[0] == 2);
    let packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 1);

    newMessage.addObject("person[]", {name: "McRaminov"});
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 3);

    newMessage.addBinary("^microfilm[]", Buffer.from("Blueprints on new submarine model Octopus"));
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 5);

    newMessage.addBinary("^microfilm[]", Buffer.from("Recipie on secret paleo pancakes from \"Abisko with Love\""));
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 7);

    newMessage.addObject("person[]", {name: "Captain Loose"});
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 9);

    newMessage.addBinary("microfilm", Buffer.from("New magazine of endangered potatoes"));
    packedBuffers = newMessage.pack();
    assert(packedBuffers.length === 11);

    // TODO: want to test when passing wrong value types and also that reading back when unpacked yields the correct type.
    newMessage.addBoolean("isReady", false);
//TODO: FIXME: unpack new TYPE_NULL field
    //newMessage.addString("name", null);
    newMessage.addString("token", "Skipabit");
    newMessage.addNumber("cost", 123456);
    newMessage.addArray("inventory", []);
    newMessage.add("any", Buffer.from("hello"));

    newMessage.addObject("chopper", {model: "BumbleBeeMagnum"});
    packedBuffers = newMessage.pack();
    //assert(packedBuffers.length === 21);

    let readMessage = new MessageDecoder(packedBuffers);
    assert(readMessage.init());
    assert(readMessage.isReady());
    let data = readMessage.unpack();

    console.log(data);
    assert(data[0] === "myAction");
    assert(data[1] === "abba4e14");
    assert(data[2].chopper.model === "BumbleBeeMagnum");
    assert(data[2].microfile !== null);
    assert(data[2].person[0].name === "McRaminov");
    assert(data[2].person[0].microfilm.length === 2);
    console.log(data[2]);

    // Test complex
    let cMessage = new MessageEncoder("myComplexAction", "deadbeef");
    let props = {
        name: "Ridge Raft",
        data1: Buffer.alloc(100).fill(1),
        data2: Buffer.alloc(200).fill(2),
    };
    cMessage.addObject("person[]", props);
    cMessage.addObject("person[]", {name: "Another"});
    cMessage.addBinary("data[]", Buffer.from("Hello"));
    cMessage.addBinary("data[]", Buffer.from("World"));
    packedBuffers = cMessage.pack();
    readMessage = new MessageDecoder(packedBuffers);
    assert(readMessage.init());
    assert(readMessage.isReady());
    data = readMessage.unpack();
    //console.log("read complex", data[2]);

    cMessage = new MessageEncoder("myComplexAction", "deadbeef");
    cMessage.addProps(data[2]);
    packedBuffers = cMessage.pack();
    readMessage = new MessageDecoder(packedBuffers);
    assert(readMessage.init());
    assert(readMessage.isReady());
    data = readMessage.unpack();
    //console.log("read complex", data[2]);
}

// Message Encoder
test_constructor();
test_getMsgId();
test_add();
test_addBinary();
test_addNull();
test_addString();
test_addNumber();
test_addBoolean();
test_addArray();
test_addObject();
test_addProps();
test_addJSON();
test_getCurrentLength();
test_getAvailableLength();
test_pack();
test_packNumber();
test_createObjectHeader();
test_createMessageHeader();

// Message Decoder
test_decoder_constructor();

// TODO: FIXME: Uncommenting these for now because object frame has changed and they need to get updated.
//test_basics();
//test_details();
test_further();
