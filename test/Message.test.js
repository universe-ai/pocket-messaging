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

describe("General", () => {
    // TODO: FIXME:
    test.skip("test_basics", () => {
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
    });

    // TODO: FIXME:
    test.skip("test_details", () => {
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
    });

    test(" test_further()", () => {
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

        // TODO: FIXME: assert instead of logging
        //console.log(data);
        assert(data[0] === "myAction");
        assert(data[1] === "abba4e14");
        assert(data[2].chopper.model === "BumbleBeeMagnum");
        assert(data[2].microfile !== null);
        assert(data[2].person[0].name === "McRaminov");
        assert(data[2].person[0].microfilm.length === 2);
        // TODO: FIXME: assert instead of logging
        //console.log(data[2]);

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
        RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
        RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
    });

    describe("constructor", () => {
        test("Missing required packed message argument", () => {
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

        // TODO: FIXME:
        test("WIP", () => {
            // Set up encoded message
            const messageDataKey = "data is a string";
            const messageDataValue = "a string";
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert.doesNotThrow(() => message.add(messageDataKey, messageDataValue));
            const messagePack = message.pack();

            // Create new decoder
            const decoder = new MessageDecoder(messagePack);
            assert(decoder.init());
            assert(decoder.isReady());
            const messageDecoded = decoder.unpack();

            assert(messageDecoded[0] == RANDOM_MESSAGE_ACTION);
            assert(messageDecoded[1] == RANDOM_MESSAGE_ID);
            assert(Object.keys(messageDecoded[2])[0] == messageDataKey);
            assert(messageDecoded[2][messageDataKey] == messageDataValue);
        });
    });
});
