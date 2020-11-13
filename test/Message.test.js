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
    MAX_MESSAGE_SIZE, MAX_OBJECT_DATA_SIZE, KEY_LENGTH, MESSAGE_FRAME_LENGTH, OBJECT_FRAME_LENGTH, MESSAGE_ID_LENGTH,
    TYPE_UINT8, TYPE_INT8, TYPE_UINT16, TYPE_INT16, TYPE_UINT32, TYPE_INT32, TYPE_TEXTNUMBER, TYPE_UTF8STRING
} = require("../Message.js");
const assert = require("assert");
const crypto = require("crypto");

describe("General", () => {
    test("test_basics", () => {
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
        assert(message.init() == false);

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
        buffers.push(objectData);
        assert(message.init() == true);
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
    });

    test("test_details", () => {
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

        const hex = "00ff70fceb711a0000005f297c5057414331483e1b0656306e1c2b063975665a5b2d123b590b4802210672057208264b7a0a6b7a7d471e344f280e5f54263e3369646c5f194b456b777d1a2f3a68305f2c643f793258334a0f2d536b39457c1e0a3d15393b140e1a37025c0a5e24257a737f4f0c6002535a0402065160637376155819026f4b2b5118164940323611115104674e6c6c09253e694d49562c741c730a4b174f5172037e27582a58653a76392f7220663d004c4c575d046549240d62523c654a2e0b213110356c105b320f61641c133056657d1d087d7e5f055478750a09720e426616323a585d422e2d69175e69152a007c0d337265724e7f64697078517a37160223031e0e08006461746120697320737472696e676120737472696e67";
        const A = Buffer.from(hex, "hex");
        message = new MessageDecoder([A]);
        assert(message.init());
        assert(message.isReady());
        assert(message.getLength() === 26);
        const data = message.unpack();
        assert(data[1] === "70fceb71");
        assert(data[2]["data is string"] === "a string");

        // TODO: we could add even more boundaries testing to see that it behaves well passing
        // over different buffers.
    });

    test("test_further()", () => {
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

        newMessage.addBoolean("isReady", false);
        newMessage.addString("name", null);
        newMessage.addString("token", "Skipabit");
        newMessage.addNumber("cost", 123456);
        newMessage.addArray("inventory", []);
        newMessage.add("any", Buffer.from("hello"));

        newMessage.addObject("chopper", {model: "BumbleBeeMagnum"});
        packedBuffers = newMessage.pack();
        assert(packedBuffers.length === 25);

        let readMessage = new MessageDecoder(packedBuffers);
        assert(readMessage.init());
        assert(readMessage.isReady());
        let data = readMessage.unpack();

        assert(data[0] === "myAction");
        assert(data[1] === "abba4e14");
        assert(data[2].token === "Skipabit");
        assert(data[2].cost === 123456);
        assert(data[2].inventory.length === 0);
        assert(data[2].chopper.model === "BumbleBeeMagnum");
        assert(data[2].microfile !== null);
        assert(data[2].person[0].name === "McRaminov");
        assert(data[2].person[0].microfilm.length === 2);
        assert(data[2].person[1].name === "Captain Loose");

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

        assert(data[2].person[0].name === "Ridge Raft");
        assert(data[2].person[1].name === "Another");

        cMessage = new MessageEncoder("myComplexAction", "deadbeef");
        cMessage.addProps(data[2]);
        packedBuffers = cMessage.pack();
        readMessage = new MessageDecoder(packedBuffers);
        assert(readMessage.init());
        assert(readMessage.isReady());
        data = readMessage.unpack();

        assert(data[0] === "myComplexAction");
        assert(data[1] === "deadbeef");
        assert(data[2].person[0].name === "Ridge Raft");
        assert(data[2].person[1].name === "Another");
    });
});

describe("MessageEncoder", () => {
    //
    // Set up a new random message action and id before every set of tests
    let RANDOM_MESSAGE_ACTION;
    let RANDOM_MESSAGE_ID;
    beforeEach(() => {
        RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
        RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
    });

    describe("constructor", () => {
        test("Missing required message action", () => {
            assert.throws(() => new MessageEncoder(), /TypeError \[ERR_INVALID_ARG_TYPE\]/);
        });

        test("Message action length exceeds limits by 1 byte", () => {
            const messageActionExceededLength = crypto.randomBytes(1024).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => new MessageEncoder(messageActionExceededLength), /Message action length 256 exceeds maximum allowed length of 255 bytes./);
        });

        test("Valid message action", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION);
            assert(message.messageAction.toString("utf8") == RANDOM_MESSAGE_ACTION);
        });

        test("Message id is not lower case hexadecimal", () => {
            const messageIdMixedCase = "aBCd12EF";
            assert.throws(() => new MessageEncoder(RANDOM_MESSAGE_ACTION, messageIdMixedCase), /Message ID must be provided as lowercase hexadecimal string./);
        });

        test("Message id length is too short: [1, 3]", () => {
            const messageIdShort = crypto.randomBytes(Math.floor(Math.random() * 3)+1).toString("hex");
            assert.throws(() => new MessageEncoder(RANDOM_MESSAGE_ACTION, messageIdShort), /Message id length [0-9] does not match expected length of 4 bytes./)
        });

        test("Message id length is too long: [4, 1024]", () => {
            const messageIdLong = crypto.randomBytes(Math.floor(Math.random() * 1024)+4).toString("hex");
            assert.throws(() => new MessageEncoder(RANDOM_MESSAGE_ACTION, messageIdLong), /Message id length .* does not match expected length of 4 bytes./);
        });

        test("Valid message id", () => {
            const messageId = "abcd12ef";
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, messageId)
            assert(message.messageId.toString("hex") == messageId);
        });

        test("Valid random message id", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.messageId.toString("hex") == RANDOM_MESSAGE_ID);
        });

        test("Check message data starts out empty", () => {
            const messageId = "abcd12ef";
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, messageId)
            assert(message.buffers instanceof Array);
            assert(message.buffers.length == 0);
        });
    });

    describe("getMsgId", () => {
        test("Retrieve expected message id", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
        });
    });

    describe("add", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is not a string", () => {
            assert.throws(() => RANDOM_MESSAGE.add(0, "key is not a string"), /Key must be string/);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.add("data is undefined", undefined), /Could not add object of type undefined, only fundamental data types allowed./);
        });

        test("Data is unsupported Array", () => {
            assert.throws(() => RANDOM_MESSAGE.add("data is unsupported Array", [ function(){}, function(){}, function(){} ]), /Could not add array, only fundamental data types allowed./);
        });

        test("Data is function", () => {
            assert.throws(() => RANDOM_MESSAGE.add("data is function", function(){}), /Could not add object of type function, only fundamental data types allowed./);
        });

        test("Data is null", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is null", null));
        });

        test("Data is string", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is string", "a string"));
        });

        test("Data is number", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is number", 10));
        });

        test("Data is boolean", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is boolean", true));
        });

        test("Data is array", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is array", [123, "abc", 4.67, "fg"]));
        });

        test("Data is Buffer", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is Buffer", Buffer.from("a string")));
        });

        test("Data is object", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is object", { "a string": 10}));
        });
    });

    describe("addBinary", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addBinary(0, Buffer.from("key is not a string")), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addBinary(bigKey, Buffer.from("the key is big")), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addBinary("data is not Buffer", undefined), /Expecting Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.throws(() => RANDOM_MESSAGE.addBinary("data is not Buffer", null), /Expecting Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is string", () => {
            assert.throws(() => RANDOM_MESSAGE.addBinary("data is not Buffer", "a string"), /Expecting Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is big Buffer", () => {
            assert.throws(() => RANDOM_MESSAGE.addBinary("data is big Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE+1)), /Too large object length 65536 for key "data is big Buffer", max size is 65535 bytes for object data in a message./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is empty Buffer", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is empty Buffer", Buffer.alloc(0)));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1))); // 1 binary * (header + data)
        });

        test("Data is Buffer", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is Buffer", Buffer.from("a string")));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1))); // 1 binary * (header + data)
        });
    });

    describe("addNull", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addNull(0), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addNull(bigKey), /Key length 256 must be string of maximum 255 bytes./);
        });

        test("Key is string", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNull("data is null"));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1))); // 1 objects * (header + empty but existing data)
        });
    });

    describe("addString", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addString(0, "key is not a string"), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addString(bigKey, "the key is big"), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addString("data is not string", undefined), /Expecting string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is big string", () => {
            const bigString = crypto.randomBytes(MAX_OBJECT_DATA_SIZE+1).toString("ascii").slice(0, MAX_OBJECT_DATA_SIZE+1);
            assert.throws(() => RANDOM_MESSAGE.addString("data is big string", bigString), /Too large object length 65536 for key "data is big string", max size is 65535 bytes for object data in a message./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addString("data is an empty string", null));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is empty string", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addString("data is empty string", ""));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is string", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addString("data is a string", "a string"));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });
    });

    describe("addNumber", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addNumber(0, "key is not a string"), /Key must be string/);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addNumber(bigKey, 1024), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addNumber("data is not number", undefined), /Expecting number/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.throws(() => RANDOM_MESSAGE.addNumber("data is not number", null), /Expecting number/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is number", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNumber("data is a number", 1024));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is float", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNumber("data is a float", 2.1024));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is big integer", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNumber("data is a big", Number.MAX_SAFE_INTEGER));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is big float", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNumber("data is a big float", Number.MAX_VALUE));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });
    });

    describe("addBoolean", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addBoolean(0, "key is not a string"), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addBoolean(bigKey, true), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addBoolean("data is not boolean", undefined), /Expecting boolean/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.throws(() => RANDOM_MESSAGE.addBoolean("data is not boolean", null), /Expecting boolean/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is zero", () => {
            assert.throws(() => RANDOM_MESSAGE.addBoolean("data is not boolean", 0), /Expecting boolean/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is integer", () => {
            assert.throws(() => RANDOM_MESSAGE.addBoolean("data is not boolean", 1), /Expecting boolean/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is true", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addBoolean("data is a boolean", true));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is false", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addBoolean("data is a boolean", false));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });
    });

    describe("addArray", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addArray(0, "key is not a string"), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addArray("data is not array", undefined), /Expecting Array/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.throws(() => RANDOM_MESSAGE.addArray("data is not array", null), /Expecting Array/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is array with unsupported data type", () => {
            assert.throws(() => RANDOM_MESSAGE.addArray("data array contains data other than primitive not data types", [ 1, "abc", function(){}]), /Could not add array, only fundamental data types allowed./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addArray(bigKey, [true]), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is array of nulls", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addArray("data is array of nulls", [null, null, null]));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is array of string", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addArray("data is array of strings", ["a", "b", "c"]));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is array of numbers", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addArray("data is array of numbers", [1, 2, 3, 4, 5]));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is array of booleans", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addArray("data is array of booleans", [true, false, false]));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is array of objects", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addArray("data is array of objects", [{"a": 1}, {"b": 2}, {"c": 3}]));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is mixed array", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addArray("data is mixed array", [null, "a", 1, true, {"b": 22}]));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });
    });

    describe("addObject", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addObject(0, "key is not a string"), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addObject("data is not object", undefined), /Expecting Object/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.throws(() => RANDOM_MESSAGE.addObject("data is not object", null), /Expecting Object/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is Array", () => {
            assert.throws(() => RANDOM_MESSAGE.addObject("data is not object", []), /Expecting Object/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE.addObject(bigKey, {}), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is object", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addObject("data is object", {"a": 1, "b": 2, "c": 3}));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is object containing one Buffer", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addObject("data is object containing one Buffer", {"d": 4, "e": Buffer.from("5"), "f": 6, }));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1) + 2));
        });
    });

    describe("addProps", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Props is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addProps({"name": undefined}), /Could not add object of type undefined, only fundamental data types allowed./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Props contains big key", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            let objectWithBigKey = {};
            objectWithBigKey[bigKey] = {};
            assert.throws(() => RANDOM_MESSAGE.addProps(objectWithBigKey), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Props is valid object with Buffers", () => {
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

            assert.doesNotThrow(() => RANDOM_MESSAGE.addProps(objectProps));
            assert(RANDOM_MESSAGE.buffers.length == (3*(1 + 1)));
        });

        test("Props contains null as value", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addProps({"null is a string": null}));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Props contains empty array as value", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addProps({"empty array is valid": []}));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });
    });

    describe("addJSON", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is number", () => {
            assert.throws(() => RANDOM_MESSAGE.addJSON(0, "key is not a string"), /Key must be string/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            const data = {"a": 1, "b": 2, "c": 3};
            const dataStr = JSON.stringify(data);
            const dataBuffer = Buffer.from(dataStr);
            assert.throws(() => RANDOM_MESSAGE.addJSON(bigKey, dataBuffer), /Key length 256 must be string of maximum 255 bytes./);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE.addJSON("data is not JSON", undefined), /Expecting JSON string or Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is null", () => {
            assert.throws(() => RANDOM_MESSAGE.addJSON("data is not JSON", null), /Expecting JSON string or Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is Array", () => {
            assert.throws(() => RANDOM_MESSAGE.addJSON("data is not JSON", []), /Expecting JSON string or Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is object", () => {
            assert.throws(() => RANDOM_MESSAGE.addJSON("data is not JSON", {}), /Expecting JSON string or Buffer/);
            assert(RANDOM_MESSAGE.buffers.length == 0);
        });

        test("Data is JSON string", () => {
            const data = {"a": 1, "b": 2, "c": 3};
            const dataStr = JSON.stringify(data);
            assert.doesNotThrow(() => RANDOM_MESSAGE.addJSON("data is JSON string", dataStr));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });

        test("Data is JSON Buffer", () => {
            const data = {"a": 1, "b": 2, "c": 3};
            const dataStr = JSON.stringify(data);
            const dataBuffer = Buffer.from(dataStr);
            assert.doesNotThrow(() => RANDOM_MESSAGE.addJSON("data is JSON Buffer", dataBuffer));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
        });
    });

    describe("getCurrentLength", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Check empty unpacked message length matches expected length", () => {
            assert(RANDOM_MESSAGE.getCurrentLength() == MESSAGE_FRAME_LENGTH + KEY_LENGTH);
        });

        test("Check unpacked message containing number and string objects matches expected length", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNumber("data is a number", 1));
            assert.doesNotThrow(() => RANDOM_MESSAGE.addString("data is a string", "a"));
            assert(RANDOM_MESSAGE.getCurrentLength() == MESSAGE_FRAME_LENGTH + KEY_LENGTH + 2 * (280 + OBJECT_FRAME_LENGTH + KEY_LENGTH) );
        });
    });

    describe("getAvailableLength", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Check message has space available", () => {
            assert(RANDOM_MESSAGE.getAvailableLength() > 0);
            assert(RANDOM_MESSAGE.getAvailableLength() < MAX_MESSAGE_SIZE);
        });

        test("Check message has space available after including number and string objects", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.addNumber("data is a number", 1));
            assert.doesNotThrow(() => RANDOM_MESSAGE.addString("data is a string", "a"));
            assert(RANDOM_MESSAGE.getAvailableLength() > 0);
            assert(RANDOM_MESSAGE.getAvailableLength() < MAX_MESSAGE_SIZE);
        });

        test("Check message is able to contain 15 binary objects of maximum size", () => {
            let i;
            for(i=0; i<15; i++) {
                assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
            }
            assert(RANDOM_MESSAGE.getAvailableLength() > 0);
            assert(RANDOM_MESSAGE.getAvailableLength() < MAX_MESSAGE_SIZE);
        });

        test("Confirm there is no overflow verification when adding binary past the available length", () => {
            let i;
            for(i=0; i<15; i++) {
                assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
            }

            assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
            assert(RANDOM_MESSAGE.getAvailableLength() < 0);
        });
    });

    describe("pack", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Successfully pack message with string data", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is string", "a string"));
            assert(RANDOM_MESSAGE.buffers.length == (1*(1 + 1)));
            const messagePack = RANDOM_MESSAGE.pack();
            assert(Buffer.compare(messagePack[0], RANDOM_MESSAGE._createMessageHeader()) == 0);
            assert(Buffer.compare(messagePack[1], RANDOM_MESSAGE.buffers[0]) == 0);
            assert(Buffer.compare(messagePack[2], RANDOM_MESSAGE.buffers[1]) == 0);
        });

        test("Fail to pack message with extrapolated binary data", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE.add("data is string", "a string"));
            let i;
            for(i=0; i<16; i++) {
                assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
            }
            assert.throws(() => RANDOM_MESSAGE.pack(), /Message length 1048874 overflows max size of 1048576 bytes./);
        });
    });

    describe("packNumber", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Pack float as string", () => {
            const pack = RANDOM_MESSAGE._packNumber("1.0");
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(pack[1].toString() === "1.0");
        });

        test("Pack integer as string", () => {
            const pack = RANDOM_MESSAGE._packNumber("1");
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(pack[1].toString() === "1");
        });

        test("Pack unsigned integer as string", () => {
            const pack = RANDOM_MESSAGE._packNumber("-1");
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(pack[1].toString() === "-1");
        });

        test("Pack float decimal 0 as number", () => {
            const pack = RANDOM_MESSAGE._packNumber(1.0);
            assert(pack[0] !== TYPE_TEXTNUMBER);
        });

        test("Pack float as number", () => {
            const pack = RANDOM_MESSAGE._packNumber(1.23456789);
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(parseFloat(pack[1].toString()) === 1.23456789);
        });

        test("Pack float scientific notation as number", () => {
            const pack = RANDOM_MESSAGE._packNumber(123456789e-8);
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(parseFloat(pack[1].toString()) === 1.23456789);
        });

        test("Pack uint8", () => {
            const pack = RANDOM_MESSAGE._packNumber(1);
            assert(pack[0] === TYPE_UINT8);
            assert(pack[1][0] === 1);
        });

        test("Pack uint16", () => {
            const pack = RANDOM_MESSAGE._packNumber(65535);
            assert(pack[0] === TYPE_UINT16);
            assert(pack[1].readUInt16LE() === 65535);
        });

        test("Pack uint32", () => {
            const pack = RANDOM_MESSAGE._packNumber(4294967295);
            assert(pack[0] === TYPE_UINT32);
            assert(pack[1].readUInt32LE() === 4294967295);
        });

        test("Pack big positive number", () => {
            const pack = RANDOM_MESSAGE._packNumber(100000000000);
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(parseFloat(pack[1].toString()) === 100000000000);
        });

        test("Pack int8", () => {
            const pack = RANDOM_MESSAGE._packNumber(-1);
            assert(pack[0] === TYPE_INT8);
            assert(pack[1].readInt8() === -1);
        });

        test("Pack int16", () => {
            const pack = RANDOM_MESSAGE._packNumber(-32767);
            assert(pack[0] === TYPE_INT16);
            assert(pack[1].readInt16LE() === -32767);
        });

        test("Pack int32", () => {
            const pack = RANDOM_MESSAGE._packNumber(-2147483648);
            assert(pack[0] === TYPE_INT32);
            assert(pack[1].readInt32LE() === -2147483648);
        });

        test("Pack big negative number", () => {
            const pack = RANDOM_MESSAGE._packNumber(-100000000000);
            assert(pack[0] === TYPE_TEXTNUMBER);
            assert(parseFloat(pack[1].toString()) === -100000000000);
        });
    });

    describe("createObjectHeader", () => {
        const buffer = Buffer.from("data", "utf8");
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Key is empty string", () => {
            assert.throws(() => RANDOM_MESSAGE._createObjectHeader(TYPE_UTF8STRING, buffer.length, ""), /Key must be provided./);
        });

        test("Key is null", () => {
            assert.throws(() => RANDOM_MESSAGE._createObjectHeader(TYPE_UTF8STRING, buffer.length, null), /Key must be provided./);
        });

        test("Key is undefined", () => {
            assert.throws(() => RANDOM_MESSAGE._createObjectHeader(TYPE_UTF8STRING, buffer.length, undefined), /Key must be provided./);
        });

        test("Key is big", () => {
            const bigKey = crypto.randomBytes(512).toString("ascii").slice(0, KEY_LENGTH+1);
            assert.throws(() => RANDOM_MESSAGE._createObjectHeader(TYPE_UTF8STRING, buffer.length, bigKey), /Key length 256 must be string of maximum 255 bytes./);
        });

        test("Length is big", () => {
            const key = "a key";
            assert.throws(() => RANDOM_MESSAGE._createObjectHeader(TYPE_UTF8STRING, MAX_OBJECT_DATA_SIZE+1, key), /Too large object length 65536 for key "a key", max size is 65535 bytes for object data in a message./);
        });

        test("Successfully create object header", () => {
            const key = "a key";
            assert.doesNotThrow(() => RANDOM_MESSAGE._createObjectHeader(TYPE_UTF8STRING, buffer.length, key));
        });
    });

    describe("createMessageHeader", () => {
        let RANDOM_MESSAGE;
        beforeEach(() => {
            RANDOM_MESSAGE = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
        });

        test("Successfully create message header", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE._createMessageHeader());
        });

        test("Fail to create message header with extrapolated buffer usage", () => {
            assert.doesNotThrow(() => RANDOM_MESSAGE._createMessageHeader());
            let i;
            for(i=0; i<16; i++) {
                assert.doesNotThrow(() => RANDOM_MESSAGE.addBinary("data is Buffer", Buffer.alloc(MAX_OBJECT_DATA_SIZE)));
            }
            assert.throws(() => RANDOM_MESSAGE._createMessageHeader(), /Message length 1048848 overflows max size of 1048576 bytes./);
        });
    });
});

describe("MessageDecoder", () => {
    //
    // Set up a new random message action before every set of tests
    let RANDOM_MESSAGE_ACTION;
    let RANDOM_MESSAGE_ID;
    beforeEach(() => {
        RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, 10);
        RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
    });

    describe("constructor", () => {
        test("Missing required packed message buffers argument", () => {
            assert.throws(() => new MessageEncoder(), /TypeError \[ERR_INVALID_ARG_TYPE\]/);
        });

        test("Create new decoder object", () => {
            // Set up encoded message
            const messageDataKey = "data is a string";
            const messageDataValue = "a string";
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert.doesNotThrow(() => message.add(messageDataKey, messageDataValue));
            const messagePack = message.pack();

            // Create new decoder
            const decoder = new MessageDecoder(messagePack);
            assert(decoder.buffers.length == 3);
            assert(decoder.position == 0);
            assert(decoder.messageId == null);
            assert(decoder.action == null);
            assert(decoder.length == null);
        });
    });

    describe("init", () => {
        //
        // Set up encoded message
        let messagePack;
        beforeEach(() => {
            const messageDataKey = "data is a string";
            const messageDataValue = "a string";
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Single initialization", () => {
            const decoder = new MessageDecoder(messagePack);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == true);
        });

        test("Double initialization", () => {
            const decoder = new MessageDecoder(messagePack);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == true);
            let repeatStatus;
            assert.throws(() => repeatStatus = decoder.init(), /Cannot run init\(\) more than once when unpacking./);
            assert(repeatStatus == undefined);
        });

        test("No data to read", () => {
            const decoder = new MessageDecoder(null);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == false);
        });

        test("First buffer byte is 0", () => {
            const decoder = new MessageDecoder(messagePack);
            assert(decoder.buffers[0].readUInt8(0) == 0x00);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == true);
        });

        test("First buffer byte is 1", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.buffers[0].writeUInt8("0x01", 0);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == false);
        });

        test("Action buffer is missing", () => {
            const buffers = [];
            const message = new MessageDecoder(buffers);
            const objectData = Buffer.alloc(32).fill(3);
            const messageAction = "hello";
            const messageId = "ABCDEFGH";
            const messageFrame = Buffer.alloc(MESSAGE_FRAME_LENGTH);
            let pos = 0;
            messageFrame.writeUInt8(0, pos);
            pos = pos + 1;
            const messageLength = objectData.length + OBJECT_FRAME_LENGTH;
            messageFrame.writeUInt32LE(messageLength, pos);
            pos = pos + 4;
            messageFrame.write(messageAction, pos);
            pos = pos + MESSAGE_ID_LENGTH;
            messageFrame.write(messageId, pos);
            buffers.push(messageFrame);
            assert(message.init() == false);
        });

        test("Action buffer is unset", () => {
            const decoder = new MessageDecoder(messagePack);
            let counter;
            for(counter=0; counter<RANDOM_MESSAGE_ACTION.length; counter++) {
                decoder.buffers[0].writeUInt8("0x00", MESSAGE_FRAME_LENGTH + counter);
            }
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == true);
        });

        test("Action length is modified", () => {
            const decoder = new MessageDecoder(messagePack);
            assert(RANDOM_MESSAGE_ACTION.length != 255);
            decoder.buffers[0].writeUInt8(255, MESSAGE_FRAME_LENGTH);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == true);
            assert(decoder.action != RANDOM_MESSAGE_ACTION);
        });

        test("Successfully initialize decoder object", () => {
            const decoder = new MessageDecoder(messagePack);
            let initStatus;
            assert.doesNotThrow(() => initStatus = decoder.init());
            assert(initStatus == true);

            assert(decoder.length != null);
            assert(decoder.messageId.toString("hex") == RANDOM_MESSAGE_ID);
            assert(decoder.length == MESSAGE_FRAME_LENGTH + RANDOM_MESSAGE_ACTION.length + RANDOM_MESSAGE_ID.length );
            assert(decoder.action == RANDOM_MESSAGE_ACTION);
            assert(decoder.position == (0 + MESSAGE_FRAME_LENGTH + RANDOM_MESSAGE_ACTION.length));
        });
    });

    describe("isReady", () => {
        //
        // Set up encoded message
        let messagePack;
        beforeEach(() => {
            const messageDataKey = "data is a string";
            const messageDataValue = "a string";
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Fail to retrieve status before initialization", () => {
            const decoder = new MessageDecoder(messagePack);
            let isReadyStatus;
            assert.throws(() => isReadyStatus = decoder.isReady(), /Cannot run isReady\(\) before init\(\) has successfully been called./);
            assert(isReadyStatus == undefined);
        });

        test("Retrieve status false due to length bigger than remaining length", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            decoder.length = decoder.length + 1;
            let isReadyStatus;
            assert.doesNotThrow(() => isReadyStatus = decoder.isReady());
            assert(isReadyStatus == false);
        });

        test("Retrieve status false due to remaining length bigger than length", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            decoder.buffers = Buffer.alloc(decoder.buffers.length + 1);
            let isReadyStatus;
            assert.doesNotThrow(() => isReadyStatus = decoder.isReady());
            assert(isReadyStatus == false);
        });

        test("Retrieve status after initialization", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let isReadyStatus;
            assert.doesNotThrow(() => isReadyStatus = decoder.isReady());
            assert(isReadyStatus == true);
        });
    });

    describe("unpack", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Data is not initialized", () => {
            const decoder = new MessageDecoder(messagePack);
            assert.throws(() => decoder.unpack(), /Cannot run isReady\(\) before init\(\) has successfully been called./);
        });

        test("Data is not ready", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            decoder.length = decoder.length + 1;
            let isReadyStatus;
            assert.doesNotThrow(() => isReadyStatus = decoder.isReady());
            assert(isReadyStatus == false);
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus == null);
        });

        test("Failure during unpacking loop", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, {a:"1", b:"2"});
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());

            // Invalidate buffers
            decoder.buffers[1].writeUInt8(255, 0);

            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus == null);
        });

        test("Regular key", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add("regular key", "regular string");
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == "regular string");
        });

        test("Key starts with ^ but there is no last object", () => {
            let messagePacked;
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            const messageDataKeyAppend = "^attached";
            message.add(messageDataKeyAppend, messageDataValue);
            messagePacked = message.pack();

            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus == null);
        });

        test("Key starts with ^", () => {
            let messagePacked;
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, {"a": 2});
            messagePacked = message.pack();
            const messageDataKeyAppend = "^attached";
            message.add(messageDataKeyAppend, {"b": 4});
            messagePacked = message.pack();

            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            console.log(unpackStatus);
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty(messageDataKey));
            assert(unpackStatus[2][messageDataKey].a == 2);
            assert(unpackStatus[2][messageDataKey].attached.b == 4);
            assert(unpackStatus.length == 3);
        });

        test("Key ends with []", () => {
            let messagePacked;
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, {"c": 6});
            messagePacked = message.pack();
            const messageDataKeyAppend = "^attached[]";
            message.add(messageDataKeyAppend, {"d": 12});
            messagePacked = message.pack();

            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            console.log(unpackStatus);
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty(messageDataKey));
            assert(unpackStatus[2][messageDataKey].c == 6);
            assert(unpackStatus[2][messageDataKey].attached[0].d == 12);
            assert(unpackStatus.length == 3);
        });

        test("Data is unknown", () => {
            let messagePacked;
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();

            // Hijack data
            decoder.buffers[1].writeUInt8(255, 0);

            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus == null);
        });

        test("Data is binary", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addBinary("regular key", Buffer.from("regular string"));
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"].toString() == "regular string");
        });

        test("Data is string", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let isReadyStatus;
            assert.doesNotThrow(() => isReadyStatus = decoder.isReady());
            assert(isReadyStatus == true);
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty(messageDataKey));
            assert(unpackStatus[2][messageDataKey] == messageDataValue);
        });

        test("Data is boolean", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addBoolean("regular key", true);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == true);
        });

        test("Data is int8", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", -2);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == -2);
        });

        test("Data is uint8", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", 2);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == 2);
        });

        test("Data is int16", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", -32767);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == -32767);
        });

        test("Data is uint16", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", 65535);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == 65535);
        });

        test("Data is int32", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", -2147483648);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == -2147483648);
        });

        test("Data is uint32", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", 4294967295);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == 4294967295);
        });

        test("Data is null", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNull("regular key");
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == null);
        });

        test("Data is big negative number", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", -100000000000);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == -100000000000);
        });

        test("Data is big number", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.addNumber("regular key", 100000000000);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"] == 100000000000);
        });

        test("Data is broken JSON", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            const data = {"vorhees": 0, "krueger": 1, "myers": 2};
            let dataJson = JSON.stringify(data);
            message.addJSON("regular key", dataJson);
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());

            // Invalidate JSON
            decoder.buffers[2].writeUInt32LE(0, 0);

            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus == null);
        });

        test("Data is JSON", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            const data = {"vorhees": 0, "krueger": 1, "myers": 2};
            message.addJSON("regular key", JSON.stringify(data));
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(unpackStatus[2].hasOwnProperty("regular key"));
            assert(unpackStatus[2]["regular key"].vorhees == 0);
            assert(unpackStatus[2]["regular key"].krueger == 1);
            assert(unpackStatus[2]["regular key"].myers == 2);
        });


        test("Data is ready with no props", () => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            const messagePacked = message.pack();
            const decoder = new MessageDecoder(messagePacked);
            decoder.init();
            assert(decoder.isReady());
            let unpackStatus;
            assert.doesNotThrow(() => unpackStatus = decoder.unpack());
            assert(unpackStatus[0] == RANDOM_MESSAGE_ACTION);
            assert(unpackStatus[1] == RANDOM_MESSAGE_ID);
            assert(Object.keys(unpackStatus[2]).length == 0);
        });
    });

    describe("_getBuffersLength", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Retrieve length", () => {
            const decoder = new MessageDecoder(messagePack);
            let length;
            assert.doesNotThrow(() => length = decoder._getBuffersLength());
            assert(length == 48);
        });

        test("Retrieve length for null buffers", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.buffers = null;
            let length;
            assert.doesNotThrow(() => length = decoder._getBuffersLength());
            assert(length == 0);
        });
    });

    describe("_getRemainingLength", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Retrieve remaining length", () => {
            const decoder = new MessageDecoder(messagePack);
            let length;
            assert.doesNotThrow(() => length = decoder._getRemainingLength());
            assert(length == 48);
        });

        test("Retrieve remaining length when position is negative", () => {
            const decoder = new MessageDecoder(messagePack);

            // Hijack position data
            decoder.position = -1;

            let length;
            assert.throws(() => length = decoder._getRemainingLength(), /[AssertionError: false == true]/);
            assert(length == undefined);
        });
    });

    describe("_readData", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Zero position", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(0, 10));
            assert(data != null);
            assert(data.length == 10);
        });

        test("Positive position", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, 10));
            assert(data != null);
            assert(data.length == 10);
        });

        test("Big positive position", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(1000, 10));
            assert(data == null);
        });

        test("Negative position", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(-1, 10));
            assert(data == null);
        });

        test("Positive length", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, 1));
            assert(data != null);
            assert(data.length == 1);
        });

        test("Negative length", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, -1));
            assert(data != null);
            assert(data.length == 0);
        });

        test("Big positive length", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, 1000));
            assert(data == null);
        });

        test("Zero length", () => {
            const decoder = new MessageDecoder(messagePack);
            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, 0));
            assert(data != null);
            assert(data.length == 0);
        });

        test("Null buffers data", () => {
            const decoder = new MessageDecoder(messagePack);

            // Invalidate buffers data
            decoder.buffers = null;

            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, 1));
            assert(data == null);
        });

        test("Undefined buffers data", () => {
            const decoder = new MessageDecoder(messagePack);

            // Invalidate buffers data
            decoder.buffers = undefined;

            let data;
            assert.doesNotThrow(() => data = decoder._readData(1, 1));
            assert(data == null);
        });
    });

    describe("_next", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Negative position", () => {
            const decoder = new MessageDecoder(messagePack);

            // Alter position
            decoder.position = -1;

            let data;
            assert.doesNotThrow(() => data = decoder._next(), /[AssertionError: false == true]/);
            assert(data == null);
        });

        test("Failure reading buffer", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();

            // Invalidate buffer
            decoder.buffers = null;

            let data;
            assert.doesNotThrow(() => data = decoder._next());
            assert(data == null);
        });

        test("Failure reading key buffer", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();

            // Invalidate buffer
            decoder.buffers[1].writeUInt32LE(2556, 1);

            let data;
            assert.doesNotThrow(() => data = decoder._next());
            assert(data == null);
        });

        test("Read object", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let type, key, data;

            assert(decoder.position == 20);
            assert.doesNotThrow(() => [type, key, data] = decoder._next());
            assert(decoder.position == 48);

            assert(type != null);
            assert(key != null);
            assert(data != null);
            assert(type == TYPE_UTF8STRING);
            assert(key == messageDataKey);
            assert(data == messageDataValue);
        });
    });

    describe("_hasNext", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Read state", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let hasNext;
            assert.doesNotThrow(() => hasNext = decoder._hasNext());
            assert(hasNext == true);
        });

        test("Fail to read state due to bad buffer", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();

            // Invalidate buffer
            decoder.buffers = null;

            let hasNext;
            assert.doesNotThrow(() => hasNext = decoder._hasNext());
            assert(hasNext == false);
        });

        test("Read state from uninitialized decoder", () => {
            const decoder = new MessageDecoder(messagePack);
            let hasNext;
            assert.doesNotThrow(() => hasNext = decoder._hasNext());
            assert(hasNext == false);
        });

    });

    describe("_getAction", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Retrieve current action", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let action;
            assert.doesNotThrow(() => action = decoder._getAction());
            assert(action == RANDOM_MESSAGE_ACTION);
        });

        test("Retrieve uninitialized action", () => {
            const decoder = new MessageDecoder(messagePack);
            let action;
            assert.doesNotThrow(() => action = decoder._getAction());
            assert(action == null);
        });
    });

    describe("_getId", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Retrieve current id", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let id;
            assert.doesNotThrow(() => id = decoder._getId());
            assert(id == RANDOM_MESSAGE_ID);
        });

        test("Retrieve uninitialized id", () => {
            const decoder = new MessageDecoder(messagePack);
            let id;
            assert.doesNotThrow(() => id = decoder._getId());
            assert(id == null);
        });
    });

    describe("getLength", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Retrieve length", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            let length;
            assert.doesNotThrow(() => length = decoder.getLength());
            assert(length == 28);
        });

        test("Retrieve length of uninitialized decoder", () => {
            const decoder = new MessageDecoder(messagePack);
            let length;
            assert.doesNotThrow(() => length = decoder.getLength());
            assert(length == null);
        });
    });

    describe("drain", () => {
        //
        // Set up encoded message
        const messageDataKey = "data is a string";
        const messageDataValue = "a string";
        let messagePack;
        beforeEach(() => {
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            message.add(messageDataKey, messageDataValue);
            messagePack = message.pack();
        });

        test("Drain to zero", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            assert(decoder.position == 20);
            assert.doesNotThrow(() => decoder._drain());
            assert(decoder.position == 0);
        });

        test("Nothing to drain", () => {
            const decoder = new MessageDecoder(messagePack);
            assert(decoder.position == 0);
            assert.doesNotThrow(() => decoder._drain());
            assert(decoder.position == 0);
        });

        test("Invalid buffers", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            decoder.buffers = null;
            assert(decoder.position == 20);
            assert.throws(() => decoder._drain(), /[AssertionError: Expecting this.buffers to have been previously initialized]/);
            assert(decoder.position == 20);
        });

        test("Big buffers", () => {
            const decoder = new MessageDecoder(messagePack);
            decoder.init();
            decoder.buffers = [Buffer.alloc(1024)];
            assert(decoder.position == 20);
            assert.doesNotThrow(() => decoder._drain());
            assert(decoder.position == 0);
        });
    });
});
