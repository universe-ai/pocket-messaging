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
});
