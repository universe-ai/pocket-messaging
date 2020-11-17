const assert = require("assert");
const fs = require("fs");
const MessageComm = require("../MessageComm");
const CreatePair = require("../../pocket-sockets/VirtualClient");
const {MessageEncoder} = require("../Message");
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

        test("Send packaged message data buffers on socket, then timeout", () => {
            let customComm;
            assert.doesNotThrow(() => { customComm = new MessageComm(socket1); });
            let ret;
            assert.doesNotThrow(async () => {
                assert(customComm.msgsInFlight["0xABBA"]);
                ret = await customComm.send([ Buffer.from("") ], "0xABBA", 4);
                assert(!customComm.msgsInFlight["0xABBA"]);
                assert(ret.isTimeout());
            });
        });
    });
});
