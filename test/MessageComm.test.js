const assert = require("assert");
const fs = require("fs");
const MessageComm = require("../MessageComm");
const CreatePair = require("../../pocket-sockets/VirtualClient");
const { MessageEncoder, KEY_LENGTH } = require("../Message.js");
const crypto = require("crypto");
const nacl = require("tweetnacl");

/*async function test(resolve, listenOptions, connectOptions, Server, Client)
{
    const server = new Server(listenOptions);

    let count = 0;

    server.onConnection(client => {
        console.log("Server accepted client");
        client.onData( data => {
            console.log("server client got data", data);
            if (++count == 2) {
                server.close();
            }
        });
        client.onDisconnect( () => {
            console.error("Server client disconnected");
        });
        client.send(Buffer.from("From server"));
    });

    server.onClose( () => {
        console.log("Server is now closed.");
        resolve();
    });

    server.listen();

    connect(connectOptions, Client);
    connect(connectOptions, Client);
}

function connect(connectOptions, Client)
{
    const client = new Client(connectOptions);

    client.onDisconnect( () => {
        console.error("Client disconnected");
    });

    client.onError(msg => {
        console.error("Client connect error:", msg);
    });

    client.onData( data => {
        console.log("client got data:", data);
        client.send(Buffer.from("Client reply"));
    });

    client.onConnect( () => {
        console.error("Client connect");
    });

    try {
        client.connect();
    }
    catch(e) {
        console.error("Could not connect", e);
    }
}

function routeMessage(a, b ,c)
{
    console.log("Incoming", a, b, c);
}

async function run(protocol, Server, Client)
{

    messageComm2.setRouter(routeMessage, false);
    messageComm2.cork();

    const message = new MessageEncoder("go");
    message.addString("namn", "ole");
    const buffers = message.pack();
    messageComm1.send(buffers);

    messageComm2.uncork(2);
    //messageComm1.send([Buffer.from("HEJ")]);
    //messageComm1.send([Buffer.from("KORV")]);
}*/

function createComms()
{
    const [socket1, socket2] = CreatePair();
    const messageComm1 = new MessageComm(socket1);
    const messageComm2 = new MessageComm(socket2);
    return [messageComm1, messageComm2];
}

describe("General", () => {
    test("test_basics", () => {
        const [m1, m2] = createComms();
        //messageComm1.setRouter(routeMessage);
        //messageComm2.setRouter(routeMessage);
        m2.cork();
        m1.sendObject("go", {m:1});
        m1.sendObject("gos", {m:2});
        //const message = new MessageEncoder("go");
        //message.addString(object);
        //const packedBuffers = message.pack();
        m2.setRouter( (a,b,c) => {
            console.log(a,b,c);
        });
        setTimeout( () => m2.uncork(2), 200);
    });

    test("test_encrypted", () => {
        const [m1, m2] = createComms();
        const keyPair1        = nacl.box.keyPair();
        const keyPair2        = nacl.box.keyPair();

        m1.setEncrypt(keyPair1, keyPair2.publicKey)
        m2.setEncrypt(keyPair2, keyPair1.publicKey)

        const buf = Buffer.from("Hello");
        console.log("clear", buf);
        const encrypted = m1._encryptBuffers([buf]);
        console.log("enc", encrypted);
        m2.incomingBuffers = encrypted;
        m2._decryptBuffers();
        console.log("decrypted", m2.decryptedBuffers);
    });

    test.skip("test_corking", () => {
        // TODO: FIXME:
    });

    test.skip("test_binary", () => {
        // TODO: FIXME:
    });

    test.skip("test_mixed", () => {
        // TODO: FIXME:
    });
});

describe("MessageComm", () => {
    describe("constructor", () => {
        test("Missing required socket parameter", () => {
            assert.throws(() => { new MessageComm(); }, /Referencing an existing socket is required for initialization./);
        });

        test("New instance", () => {
            const [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { new MessageComm(socket1); });
        });

        test("New instance with routeMessage", () => {
            const [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { new MessageComm(socket1, (action, msgId, props) => { assert(false); }) });
        });
    });

    describe("_setupJanitorChannel", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("Check send is called", () => {
            let data, msgId, timeout, callback;
            const send = jest.fn((a, b, c, d) => {
                data = a;
                msgId = b;
                timeout = c;
                callback = d;
            });
            comm.send = send;

            assert(comm.msgsInFlight["00000000"]);
            assert(comm.msgsInFlight["00000000"].onReply == null);
            assert(comm.msgsInFlight["00000000"].timeout == 0);
            assert(comm.msgsInFlight["00000000"].callbackTimeout == 0);
            assert.doesNotThrow(() => { comm._setupJanitorChannel(); });
            assert(data.length == 0);
            assert(msgId == "00000000");
            assert(timeout == 0);
            assert(typeof callback == "function");
        });

        test.skip("Check sendMessage is called", () => {
            assert.doesNotThrow(() => { comm._setupJanitorChannel(); });
            assert(false, "TODO: FIXME: assert socket sends ping");
        });

        test("Check lastActivity is touched", async () => {
            const lastActivity = comm.lastActivity;
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.doesNotThrow(() => { comm._setupJanitorChannel(); });
            assert(lastActivity != comm.lastActivity);
            assert(comm.lastActivity >= (Date.now() - 1000) && comm.lastActivity <= Date.now());
        });

        test("Check inactivity is called", async (done) => {
            comm.inactivityThreshold = -9999;
            const sendMessage = jest.fn(() => {
                return {
                    isSuccess: function(){
                        return false
                    }
                };
            });
            comm.sendMessage = sendMessage;

            assert.doesNotThrow(async() => {
                assert(comm.socket.isDisconnected == false);
                await comm._setupJanitorChannel();
                assert(comm.socket.isDisconnected == true);
                done();
            });
        });
    });

    describe("_checkInactivity", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("Date now is newer than last activity", async (done) => {
            comm.lastActivity = 0;
            let called = false;
            const sendMessage = jest.fn(() => {
                called = true;
                return {
                    isSuccess: function(){
                        return false
                    }
                };

            });
            comm.sendMessage = sendMessage;

            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();
                assert(called == true);
                done();
            });
        });

        test("Date now is older than last activity", async (done) => {
            comm.lastActivity = Date.now() + 999999;
            let called = false;
            const sendMessage = jest.fn(() => {
                called = true;
                return {
                    isSuccess: function(){
                        return false
                    }
                };

            });
            comm.sendMessage = sendMessage;

            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();
                assert(called == false);
                done();
            });
        });

        test("Date now is newer than threshold", async (done) => {
            comm.inactivityThreshold = 0;
            let called = false;
            const sendMessage = jest.fn(() => {
                called = true;
                return {
                    isSuccess: function(){
                        return false
                    }
                };

            });
            comm.sendMessage = sendMessage;

            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();
                await new Promise(resolve => setTimeout(resolve, 100));
                await comm._checkInactivity();
                assert(called == true);
                done();
            });
        });

        test("Date now is older than threshold", async (done) => {
            comm.inactivityThreshold = 999999;
            let called = false;
            const sendMessage = jest.fn(() => {
                called = true;
                return {
                    isSuccess: function(){
                        return false
                    }
                };

            });
            comm.sendMessage = sendMessage;

            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();
                assert(called == false);
                done();
            });
        });

        test("pingPong is false", async (done) => {
            comm.pingPong = false;
            comm.inactivityThreshold = 0;
            let called = false;
            const sendMessage = jest.fn(() => {
                called = true;
                return {
                    isSuccess: function(){
                        return false
                    }
                };

            });
            comm.sendMessage = sendMessage;

            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();

                await new Promise(resolve => setTimeout(resolve, 100));
                await comm._checkInactivity();

                assert(called == false);
                done();
            });
        });

        test("isClosed is false", async (done) => {
            let called = false;
            global.setTimeout = jest.fn(() => {
                called = true;
            });

            comm.isClosed = false;
            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();
                assert(called == true);
                done();
            });
        });

        test("isClosed is true", async (done) => {
            let called = false;
            global.setTimeout = jest.fn(() => {
                called = true;
            });

            comm.isClosed = true;
            assert.doesNotThrow(async() => {
                assert(called == false);
                await comm._checkInactivity();
                assert(called == false);
                done();
            });
        });
    });

    describe("send", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("Missing buffers parameter", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send(); });
            assert(ret.isException());
            assert(ret.errorMessage() == "Send buffers are null. Error in packing message?");
        });

        test("buffers is null", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send(null); });
            assert(ret.isException());
            assert(ret.errorMessage() == "Send buffers are null. Error in packing message?");
        });

        test("Empty buffers parameter", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ]); });
            assert(ret.isSuccess());
        });

        test("msgId is null", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null); });
            assert(ret.isSuccess());
        });

        test("msgId is null while timeout is set", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, 10); });
            assert(ret.isException());
            assert(ret.errorMessage() == "msgId must also be set if expecting callback or timeout.");
        });

        //
        // Setting up reply with unset msgId
        test("msgId is null while callback is set", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, null, () => {}); });
            assert(ret.isException());
            assert(ret.errorMessage() == "msgId must also be set if expecting callback or timeout.");
        });
        test("msgId is null while callbackTimeout is set", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, null, null, 10); });
            assert(ret.isException());
            assert(ret.errorMessage() == "msgId must also be set if expecting callback or timeout.");
        });
        test("timeout is null", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, null); });
            assert(ret.isSuccess());
        });

        test("timeout is undefined", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, undefined); });
            assert(ret.isSuccess());
        });

        test("Socket is closed", () => {
            comm.isClosed = true;
            let ret;
            assert.doesNotThrow(() => { ret = comm.send(); });
            assert(ret.isException());
            assert(ret.errorMessage() == "Socket is closed.");
        });

        test("msgId already in use", () => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], "00000000"); });
            assert(ret.isException());
            assert(ret.errorMessage() == "Message ID already in use: 00000000");
        });

        test("Delete message if no callback is defined", async(done) => {
            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ ], "0xABBA", 4); assert(!comm.msgsInFlight["0xABBA"]); });
            let status = await ret;
            assert(status.isSuccess());
            done();
        });

        test("Error encrypting buffers", () => {
            const _encryptBuffers = jest.fn(() => {
                throw "Error"
            });
            comm._encryptBuffers = _encryptBuffers;

            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, undefined); });
            assert(ret.isSocketError());
        });

        test("Error sending encrypted buffers", () => {
            comm.socket = {
                send: function() {
                    throw "Error";
                },
                disconnect: function() {
                }
            };

            let ret;
            assert.doesNotThrow(() => { ret = comm.send([ Buffer.from("") ], null, undefined); });
            assert(ret.isSocketError());
        });

        test.skip("Send packaged message data buffers on socket, then timeout", async(done) => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let ret;
            assert.doesNotThrow(async () => {
                assert(!customComm.msgsInFlight["0xABBA"]);
                ret = await customComm.send([ Buffer.from("") ], "0xABBA", 1);
                assert(ret.isTimeout());
                done();
            });
        });
    });

    describe("sendMessage", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("message parameter is missing", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            assert.throws(() => {const ret = customComm.sendMessage(); }, /Cannot send message of type undefined. Expected message to be instanceof MessageEncoder/);
        });

        test("message is null", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            assert.throws(() => {const ret = customComm.sendMessage(null); }, /Cannot send message of type object. Expected message to be instanceof MessageEncoder/);
        });

        test("message is not MessageEncoder", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            const message = {};
            assert.throws(() => {const ret = customComm.sendMessage(message); }, /Cannot send message of type object. Expected message to be instanceof MessageEncoder/);
        });

        test("expectReply is missing", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            assert.doesNotThrow(() => {const ret = customComm.sendMessage(message); });
        });

        test("expectReply is null", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            assert.throws(() => {const ret = customComm.sendMessage(message, null); }, /[AssertionError: false == true]/);
        });

        test("expectReply is not boolean", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            assert.throws(() => {const ret = customComm.sendMessage(message, "true"); }, /[AssertionError: false == true]/);
        });

        test.skip("send then timeout", async (done) => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            let ret;
            assert.doesNotThrow(async () => {
                ret = await customComm.sendMessage(message, true, 1);
                assert(ret.isTimeout());
                done();
            });
        });
    });

    describe("sendObject", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("action parameter is missing", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            assert.throws(() => {const ret = customComm.sendObject(); }, /[AssertionError: false == true]/);
        });

        test("action is null", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            assert.throws(() => {const ret = customComm.sendObject(null); }, /[AssertionError: false == true]/);
        });

        test("action is not string", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            const action = [];
            assert.throws(() => {const ret = customComm.sendObject(message); }, /[AssertionError: false == true]/);
        });

        test("object parameter is missing", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            const action = "my action";
            assert.throws(() => {const ret = customComm.sendObject(action); }, /[AssertionError: false == true]/);
        });

        test("object parameter is null", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            const action = "my action";
            assert.doesNotThrow(() => {const ret = customComm.sendObject(action, null); });
        });

        test("object parameter is not Object", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            const action = "my action";
            const object = [];
            assert.throws(() => {const ret = customComm.sendObject(action, object); }, /[AssertionError: false == true]/);
        });

        test("expectReply is missing", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            assert.throws(() => {const ret = customComm.sendObject(message); }, /[AssertionError: false == true]/);
        });

        test("expectReply is null", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            assert.throws(() => {const ret = customComm.sendObject(message, null); }, /[AssertionError: false == true]/);
        });

        test("expectReply is not boolean", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            const message = new MessageEncoder(RANDOM_MESSAGE_ACTION, RANDOM_MESSAGE_ID)
            assert(message.getMsgId() == RANDOM_MESSAGE_ID);
            assert.throws(() => {const ret = customComm.sendObject(message, "true"); }, /[AssertionError: false == true]/);
        });

        test.skip("send then timeout", async (done) => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let RANDOM_MESSAGE_ACTION;
            let RANDOM_MESSAGE_ID;
            RANDOM_MESSAGE_ACTION = crypto.randomBytes(KEY_LENGTH).toString("ascii").slice(0, KEY_LENGTH);
            RANDOM_MESSAGE_ID = crypto.randomBytes(4).toString("hex");
            let ret;
            assert.doesNotThrow(async () => {
                ret = await customComm.sendObject(RANDOM_MESSAGE_ACTION, { "myobject": RANDOM_MESSAGE_ID}, true, 1);
                assert(ret.isTimeout());
                done();
            });
        });
    });

    describe("clearPendingMessage", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("Invalid message id", () => {
            assert(comm.msgsInFlight["00000000"]);
            assert.doesNotThrow(() => { comm.clearPendingMessage(); });
            assert(comm.msgsInFlight["00000000"]);
        });

        test("Invalid message id", () => {
            assert(comm.msgsInFlight["00000000"]);
            assert.doesNotThrow(() => { comm.clearPendingMessage("00000000"); });
            assert(!comm.msgsInFlight["00000000"]);
        });
    });

    describe("close", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("socket is invalid", () => {
            assert(!comm.socket.isDisconnected);
            comm.socket = null;
            assert.throws(() => { comm.close(); }, /[AssertionError: false == true]/);
            assert(!comm.socket);
        });

        test("socket is valid and connected", () => {
            assert(!comm.socket.isDisconnected);
            assert.doesNotThrow(() => { comm.close(); });
            assert(comm.socket.isDisconnected);
        });

        test("socket is valid and already disconnected", () => {
            assert(!comm.socket.isDisconnected);
            assert.doesNotThrow(() => { comm.close(); });
            assert(comm.socket.isDisconnected);
        });
    });

    describe("onDisconnect", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("fn is undefined", () => {
            comm.eventHandlers = undefined;
            assert.throws(() => { comm.onDisconnect(undefined); }, /fn parameter must be set/);
        });

        test("fn is null", () => {
            comm.eventHandlers = null;
            assert.throws(() => { comm.onDisconnect(null); }, /fn parameter must be set/);
        });

        test("fn is not function", () => {
            comm.eventHandlers = {};
            assert.doesNotThrow(() => { comm.onDisconnect({}); });
            assert(Object.keys(comm.eventHandlers).length == 1);
        });

        test("fn is function", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm.onDisconnect(function(){}); });
            assert(Object.keys(comm.eventHandlers).length == 1);
            assert(comm.eventHandlers["disconnect"].length == 1);
        });
    });

    describe("offDisconnect", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("fn is undefined", () => {
            comm.eventHandlers = undefined;
            assert.throws(() => { comm.onDisconnect(undefined); }, /fn parameter must be set/);
        });

        test("fn is null", () => {
            comm.eventHandlers = null;
            assert.throws(() => { comm.onDisconnect(null); }, /fn parameter must be set/);
        });

        test("fn is not function", () => {
            comm.eventHandlers = {};
            assert.doesNotThrow(() => { comm.onDisconnect({}); });
            assert(Object.keys(comm.eventHandlers).length == 1);
        });

        test("fn is function", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => {
                const fn = function(){};
                comm.onDisconnect(fn);
                assert(Object.keys(comm.eventHandlers).length == 1);
                assert(comm.eventHandlers["disconnect"].length == 1);
                comm.offDisconnect(fn);
                assert(comm.eventHandlers["disconnect"].length == 0);
            });
        });
    });

    describe("_on", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("eventHandlers is undefined", () => {
            comm.eventHandlers = undefined;
            assert.throws(() => { comm._on(undefined); }, /Expected eventHandlers to be defined/);
        });

        test("eventHandlers is null", () => {
            comm.eventHandlers = null;
            assert.throws(() => { comm._on(null); }, /Expected eventHandlers to be defined/);
        });

        test("eventHandlers is empty object", () => {
            comm.eventHandlers = {};
            assert.doesNotThrow(() => { comm._on("disconnected", function(){}); });
            assert(Object.keys(comm.eventHandlers).length == 1);
        });

        test("event is undefined", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.throws(() => { comm._on(undefined); }, /[AssertionError: undefined == true]/);
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is null", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.throws(() => { comm._on(null); }, /[AssertionError: null == true]/);
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is string, missing fn", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.throws(() => { comm._on("disconnected"); }, /[AssertionError: undefined == true]/);
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("fn is undefined", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.throws(() => { comm._on("disconnected", undefined); }, /[AssertionError: undefined == true]/);
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("fn is null", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.throws(() => { comm._on("disconnected", null); }, /[AssertionError: null == true]/);
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is string and fn is Function", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._on("disconnected", function(){}); });
            assert(Object.keys(comm.eventHandlers).length == 1);
            assert(comm.eventHandlers["disconnected"].length == 1);
        });
    });

    describe("_off", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("eventHandlers is undefined", () => {
            comm.eventHandlers = undefined;
            assert.throws(() => { comm._off(undefined); }, /Expected eventHandlers to be defined/);
        });

        test("eventHandlers is null", () => {
            comm.eventHandlers = null;
            assert.throws(() => { comm._off(null); }, /Expected eventHandlers to be defined/);
        });

        test("eventHandlers contains existing on event", () => {
            const callback = function(){};
            comm._on("disconnected", callback);
            assert(Object.keys(comm.eventHandlers).length == 1);
            assert.doesNotThrow(() => {
                comm._off("disconnected", callback);
                assert(Object.keys(comm.eventHandlers).length == 1);
                assert(comm.eventHandlers["disconnected"].length == 0);
            });
        });

        test("event is undefined", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._off(undefined); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is null", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._off(null); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is string, missing fn", () => {
            comm.eventHandlers = {};
            comm.eventHandlers["disconnected"] = function(){};
            assert(Object.keys(comm.eventHandlers).length == 1);
            assert.doesNotThrow(() => { comm._off("undefined"); });
            assert(Object.keys(comm.eventHandlers).length == 1);
        });

        test("fn is undefined", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._off("disconnected", undefined); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("fn is null", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._off("disconnected", null); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });
    });

    describe("_triggerEvent", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("eventHandlers is undefined", () => {
            comm.eventHandlers = undefined;
            assert.throws(() => { comm._triggerEvent(undefined); }, /Expected eventHandlers to be defined/);
        });

        test("eventHandlers is null", () => {
            comm.eventHandlers = null;
            assert.throws(() => { comm._triggerEvent(undefined); }, /Expected eventHandlers to be defined/);
        });

        test("eventHandlers contains existing on event", () => {
            let called1 = false;
            comm._on("disconnected", function(d) {
                called1 = d;
            });
            let called2 = false;
            comm._on("disconnected", function(d) {
                called2 = d;
            });
            let called3 = false;
            comm._on("disconnected", function(d) {
                called3 = d;
            });
            assert(Object.keys(comm.eventHandlers).length == 1);
            assert.doesNotThrow(() => {
                assert(called1 == false);
                assert(called2 == false);
                assert(called3 == false);
                assert.doesNotThrow(() => {
                    comm._triggerEvent("disconnected", true);
                    assert(called1 == true);
                    assert(called2 == true);
                    assert(called3 == true);
                });
            });
        });

        test("event is undefined", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._triggerEvent(undefined); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is null", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._triggerEvent(null); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("event is string, missing fn", () => {
            comm.eventHandlers = {};
            comm.eventHandlers["disconnected"] = function(){};
            assert(Object.keys(comm.eventHandlers).length == 1);
            assert.doesNotThrow(() => { comm._triggerEvent("undefined"); });
            assert(Object.keys(comm.eventHandlers).length == 1);
        });

        test("fn is undefined", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._triggerEvent("disconnected", undefined); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });

        test("fn is null", () => {
            assert(typeof comm.eventHandlers == "object");
            assert(Object.keys(comm.eventHandlers).length == 0);
            assert.doesNotThrow(() => { comm._triggerEvent("disconnected", null); });
            assert(Object.keys(comm.eventHandlers).length == 0);
        });
    });

    describe("setBufferSize", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("defaultMaxBufferSize is unset", () => {
            comm.defaultMaxBufferSize = null;
            assert.throws(() => { comm.setBufferSize(1024); }, /Expected defaultMaxBufferSize to be defined/);
        });

        test("number is undefined", () => {
            assert(comm.maxBufferSize == comm.defaultMaxBufferSize);
            assert.doesNotThrow(() => { comm.setBufferSize(); });
            assert(comm.maxBufferSize == comm.defaultMaxBufferSize);
        });

        test("number is null", () => {
            assert(comm.maxBufferSize == comm.defaultMaxBufferSize);
            assert.doesNotThrow(() => { comm.setBufferSize(null); });
            assert(comm.maxBufferSize == comm.defaultMaxBufferSize);
        });

        test("number is valid", () => {
            assert(comm.maxBufferSize == comm.defaultMaxBufferSize);
            assert.doesNotThrow(() => { comm.setBufferSize(1024); });
            assert(comm.maxBufferSize == 1024);
        });
    });

    describe("setRouter", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("fn is undefined", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter();
                assert(comm.routeMessage === undefined);
            });
        });

        test("fn is null", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter(null);
                assert(comm.routeMessage === null);
            });
        });

        test("fn is function", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter(function(){});
                assert(typeof comm.routeMessage == "function");
            });
        });

        test("fn is not function", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter([]);
                assert(typeof comm.routeMessage != "function");
            });
        });

        test("routeAsBinary is undefined", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter(function(){});
                assert(typeof comm.routeMessage == "function");
                assert(comm.routeAsBinary == false);
            });
        });

        test("routeAsBinary is null", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter(function(){}, null);
                assert(typeof comm.routeMessage == "function");
                assert(comm.routeAsBinary == false);
            });

        });

        test("routeAsBinary is false", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter(function(){}, false);
                assert(typeof comm.routeMessage == "function");
                assert(comm.routeAsBinary == false);
            });

        });

        test("routeAsBinary is true", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.setRouter(function(){}, true);
                assert(typeof comm.routeMessage == "function");
                assert(comm.routeAsBinary == true);
            });

        });

        test("check _onData is called when routeAsBinary is set", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                let called = false;
                comm._onData = function() {
                    called = true;
                };
                comm.setRouter(function(){}, true);
                assert(typeof comm.routeMessage == "function");
                assert(comm.routeAsBinary == true);
                assert(called == true);
            });
        });

        test("check _onData is not called when routeAsBinary is disabled", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                let called = false;
                comm._onData = function() {
                    called = true;
                };
                comm.setRouter(function(){}, false);
                assert(typeof comm.routeMessage == "function");
                assert(comm.routeAsBinary == false);
                assert(called == false);
            });
        });
    });

    describe("drain", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("check routeMessage and routeAsBinary side effects", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                assert(comm.routeAsBinary == false);
                comm.drain();
                assert(comm.routeMessage === null);
                assert(comm.routeAsBinary == true);
            });
        });

        test("check _onData is called", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                let called = false;
                comm._onData = function() {
                    called = true;
                };
                comm.drain(function(){}, true);
                assert(called == true);
            });
        });
    });

    describe("cork", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("check routeLimit", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.cork();
                assert(comm.routeLimit == 0);
            });
        });
    });

    describe("uncork", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("check routeLimit when undefined", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.uncork();
                assert(comm.routeLimit == -1);
            });
        });

        test("check routeLimit when null", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.uncork(null);
                assert(comm.routeLimit == -1);
            });
        });

        test("check routeLimit when valid number", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                comm.uncork(3);
                assert(comm.routeLimit == 3);
            });
        });

        test("check _onData is called when number", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                let called = false;
                comm._onData = function() {
                    called = true;
                };
                comm.uncork(3);
                assert(called == true);
            });
        });

        test("check _onData is called when null", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                let called = false;
                comm._onData = function() {
                    called = true;
                };
                comm.uncork(null);
                assert(called == true);
            });
        });

        test("check _onData is called when undefined", () => {
            assert(!comm.routeMessage);
            assert.doesNotThrow(() => {
                let called = false;
                comm._onData = function() {
                    called = true;
                };
                comm.uncork();
                assert(called == true);
            });
        });
    });

    describe("_checkTimeouts", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => {
                comm = new MessageComm(socket1);
                comm.isClosed = true;
            });
        });

        test("msgsInFlight is undefined", () => {
            comm.msgsInFlight = undefined;
            assert.throws(() => comm._checkTimeouts(), /TypeError: Cannot convert undefined or null to object/);
        });

        test("msgsInFlight is null", () => {
            comm.msgsInFlight = null;
            assert.throws(() => comm._checkTimeouts(), /TypeError: Cannot convert undefined or null to object/);
        });

        test("isClosed is true", () => {
            jest.useFakeTimers();
            comm.isClosed = true;
            assert.doesNotThrow(() => {
                comm._checkTimeouts();
                expect(setTimeout).not.toHaveBeenCalledTimes(1);
            });
        });

        test("isClosed is false", () => {
            jest.useFakeTimers();
            comm.isClosed = false;
            assert.doesNotThrow(() => {
                comm._checkTimeouts();
                expect(setTimeout).toHaveBeenCalledTimes(1);
            });
        });

        test("onReply is set but clearPendingMessage is not triggered", () => {
            let onReplyCalled = false;
            comm.msgsInFlight["testid"] = {
                onReply: function() {
                    onReplyCalled = true;
                },
                lastActivity: Date.now(),
                timeout: 0
            };
            let clearPendingMessageCalled = false;
            comm.clearPendingMessage = function(_) {
                clearPendingMessageCalled = true;
            }
            assert.doesNotThrow(() => {
                comm._checkTimeouts();
                assert(onReplyCalled == false);
                assert(clearPendingMessageCalled == false);
            });
        });

        test("clearPendingMessage triggered by onReply", () => {
            comm.msgsInFlight["testid"] = {
                onReply: function() {},
                lastActivity: Date.now()-10,
                timeout: 1
            };
            let clearPendingMessageCalled = false;
            comm.clearPendingMessage = function(_) {
                clearPendingMessageCalled = true;
            }
            comm.timeout = 0;
            assert.doesNotThrow(() => {
                comm._checkTimeouts();
                assert(clearPendingMessageCalled == true);
            });
        });

        test("onCallback is set but clearPendingMessage is not triggered", () => {
            let onCallbackCalled = false;
            comm.msgsInFlight["testid"] = {
                onCallback: function() {
                    onCallbackCalled = true;
                },
                lastActivity: Date.now(),
                callbackTimeout: 0
            };
            let clearPendingMessageCalled = false;
            comm.clearPendingMessage = function(_) {
                clearPendingMessageCalled = true;
            }
            assert.doesNotThrow(() => {
                comm._checkTimeouts();
                assert(onCallbackCalled == false);
                assert(clearPendingMessageCalled == false);
            });
        });

        test("clearPendingMessage triggered by onCallback", (done) => {
            comm.msgsInFlight["testid"] = {
                onCallback: function() {
                    return false;
                },
                lastActivity: Date.now()-10,
                callbackTimeout: 1
            };
            let clearPendingMessageCalled = false;
            comm.clearPendingMessage = function(_) {
                clearPendingMessageCalled = true;
            }
            assert.doesNotThrow(async () => {
                await comm._checkTimeouts();
                assert(clearPendingMessageCalled == true);
                done();
            });
        });
    });

    describe("_onData", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => {
                comm = new MessageComm(socket1);
                comm.isClosed = true;
            });
        });

        test("buffer is undefined", () => {
            assert.doesNotThrow(() => comm._onData());
        });

        test("buffer is null", () => {
            assert.doesNotThrow(() => comm._onData(null));
        });

        test("buffer is set but not Buffer", () => {
            assert.throws(() => comm._onData([]), /Socket error, Buffer not read/);
        });

        test("buffer is Buffer", () => {
            assert.doesNotThrow(() => {
                comm._onData(Buffer.from("test"));
            });
        });

        test("buffer is empty", () => {
            assert.doesNotThrow(() => {
                comm._onData(Buffer.from(""));
            });
        });

        test("buffer length is bigger than maxBufferSize", () => {
            assert(comm.socket.isDisconnected == false);
            assert.doesNotThrow(() => comm._onData(Buffer.alloc(comm.maxBufferSize+1)));
            assert(comm.socket.isDisconnected == true);
        });

        test("buffer length is big but maxBufferSize is unset", () => {
            assert(comm.socket.isDisconnected == false);
            comm.maxBufferSize = 0;
            assert.doesNotThrow(() => comm._onData(Buffer.alloc(comm.maxBufferSize+1)));
            assert(comm.socket.isDisconnected == false);
        });

        test("route as binary with router", () => {
            let called = false;
            comm.routeMessage = function() {
                called = true;
            };
            comm.routeAsBinary = true;
            assert.doesNotThrow(() => {
                assert(called == false);
                comm._onData(Buffer.alloc(1));
                assert(called == true);
            });
        });

        test("route as binary without router", () => {
            comm.routeAsBinary = true;
            comm.routeMessage = null;
            assert.doesNotThrow(() => {
                comm._onData(Buffer.alloc(1));
                assert(comm.incomingBuffers.length == 0);
            });
        });

        test("decrypt buffer when route limit is non-zero", () => {
            let called = false;
            comm._decryptBuffers = function() {
                called = true;
            }
            assert.doesNotThrow(() => {
                assert(called == false);
                comm._onData(Buffer.alloc(1));
                assert(called == true);
            });
        });

        test("decode and route", () => {
            let called = false;
            comm._decodeIncoming = function() {
                return true;
            }
            comm._routeMessage = function() {
                called = true;
            }
            assert.doesNotThrow(() => {
                assert(called == false);
                comm.routeLimit = 1;
                comm._onData(Buffer.alloc(1));
                assert(called == true);
            });
        });
    });

    describe("_decryptBuffers", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => {
                comm = new MessageComm(socket1);
                comm.isClosed = true;
            });
        });

        test("encrypt is unset", () => {
            comm.encrypt = false;
            comm.incomingBuffers = [ Buffer.from("") ];
            assert.doesNotThrow(() => {
                assert(comm.decryptedBuffers.length == 0);
                const status = comm._decryptBuffers();
                assert(status == true);
                assert(comm.decryptedBuffers.length == 1);
                assert(comm.incomingBuffers.length == 0);
            });
        });

        test("encrypt is set and incoming buffer is too short", () => {
            comm.encrypt = true;
            comm.incomingBuffers = [ Buffer.from("") ];
            assert.doesNotThrow(() => {
                assert(comm.decryptedBuffers.length == 0);
                const status = comm._decryptBuffers();
                assert(status == false);
                assert(comm.decryptedBuffers.length == 0);
                assert(comm.incomingBuffers.length == 1);
            });
        });

        test("encrypt is set and inner incoming buffer data is too short", () => {
            comm.encrypt = true;
            const buffers = [
                Buffer.from([0x80, 0x00, 0x00, 0x00]),
                Buffer.from([0x33, 0x32]),
                Buffer.from([0x31]),
                Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
            ];
            comm.incomingBuffers = buffers;
            comm.incomingBuffers[0].writeUInt32LE(128);
            assert.doesNotThrow(() => {
                assert(comm.decryptedBuffers.length == 0);
                const status = comm._decryptBuffers();
                assert(status == false);
                assert(comm.decryptedBuffers.length == 0);
                assert(comm.incomingBuffers.length == 4);
            });
        });
    });

    describe("_incBusy", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("invalid action", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                assert(!comm.busyCount[action]);
                assert.doesNotThrow(() => { comm._incBusy(action); });
                assert(!comm.busyCount[action]);
            });
        });

        test("valid action but inner count doesn't exist", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {};
                assert.throws(() => { comm._incBusy(action); }, /Expected count to be a valid number/);
                assert(!comm.busyCount[action].count);
            });
        });

        test("valid action", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {
                    "count": 6
                };
                assert.doesNotThrow(() => { comm._incBusy(action); });
                assert(comm.busyCount[action].count == 7);
            });
        });
    });

    describe("_decBusy", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("invalid action", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                assert(!comm.busyCount[action]);
                assert.doesNotThrow(() => { comm._decBusy(action); });
                assert(!comm.busyCount[action]);
            });
        });

        test("valid action but inner count doesn't exist", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {};
                assert.throws(() => { comm._decBusy(action); }, /Expected count to be a valid number/);
                assert(!comm.busyCount[action].count);
            });
        });

        test("valid action", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {
                    "count": 5
                };
                assert.doesNotThrow(() => { comm._decBusy(action); });
                assert(comm.busyCount[action].count == 4);
            });
        });
    });

    describe("isBusy", () => {
        let comm;
        let socket1;
        beforeEach(() => {
            [socket1, _] = CreatePair();
            assert.doesNotThrow(() => { comm = new MessageComm(socket1); });
        });

        test("invalid action", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                assert(!comm.busyCount[action]);
                assert.doesNotThrow(() => {
                    let isBusy = comm.isBusy(action);
                    assert(isBusy == false);
                });
            });
        });

        test("valid action but inner count doesn't exist", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {};
                assert.doesNotThrow(() => {
                    let isBusy = comm.isBusy(action);
                    assert(isBusy == false);
                });
            });
        });

        test("valid action but no max", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {
                    "count": 5
                };
                assert.doesNotThrow(() => {
                    let isBusy = comm.isBusy(action);
                    assert(isBusy == false);
                });
            });
        });

        test("valid action and max", () => {
            assert.doesNotThrow(() => {
                const action = "testaction";
                comm.busyCount[action] = {
                    "count": 5,
                    "max": 1
                };
                assert.doesNotThrow(() => {
                    let isBusy = comm.isBusy(action);
                    assert(isBusy == true);
                });
            });
        });
    });
});
