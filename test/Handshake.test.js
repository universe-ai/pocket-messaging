#!/usr/bin/env node

const MessageComm = require("../MessageComm");
const Handshake = require("../Handshake");
const CreatePair = require("../../pocket-sockets/VirtualClient");
const AsyncRet = require("../AsyncRet");
const AbstractAgent = require("../AbstractAgent");
const assert = require("assert");

class Agent extends AbstractAgent
{
    static SerializeClientParams(clientParams)
    {
        return JSON.stringify(clientParams);
    }

    static async MatchParams(serializedClientParams, serverParams, clientPubKey)
    {
        const rootNodeId    = null;
        const protocol      = null;
        const config        = {};

        return [
            {
                rootNodeId:     rootNodeId,
                protocol:       serverParams.protocol,
                config:         serverParams.config,
                storageFactory: null,
            },
            JSON.stringify({rootNodeId: rootNodeId}),
        ];
    }
}

function createComms()
{
    const [socket1, socket2] = CreatePair();
    const messageComm1 = new MessageComm(socket1);
    const messageComm2 = new MessageComm(socket2);
    return [messageComm1, messageComm2];
}

function handshake(client, server, messageCommC, messageCommS, serverKeyMismatch=false)
{
    const serializedClientParameters = Agent.SerializeClientParams(client.params);

    let p1;
    if(serverKeyMismatch) {
        p1 = Handshake.AsClient(messageCommC, "00000000002fb556880bab0c0f17181acf5b2c2e79bc3708261e7e0000000000", client.keyPair, serializedClientParameters, client.innerEncrypt);
    } else {
        p1 = Handshake.AsClient(messageCommC, client.serverPubKey, client.keyPair, serializedClientParameters, client.innerEncrypt);
    }
    const p2 = Handshake.AsServer(messageCommS, server.keyPair,
                        (clientPubKey, clientParams, innerEncrypt) => Agent.ServerMatchAccept(clientPubKey, clientParams, server.accept, innerEncrypt));

    return [p1, p2];
}

async function main(messageCommC, messageCommS, serverKeyMismatch=false)
{
    const clientKey = {
        pub: '20ba0b643b67e6ef9c438ae38b19e91d94307998f8928e4bf24ac80b7ac64e90',
        priv: 'a9e53a52f8856f4921bb69fd6ed76f2f989c5311f56e36b77d8cf5c75f0ddd2e20ba0b643b67e6ef9c438ae38b19e91d94307998f8928e4bf24ac80b7ac64e90'
    };

    const serverKey = {
        pub: 'eacf781c522fb556880bab0c0f17181acf5b2c2e79bc3708261e7e7d38dde350',
        priv: '6cac1d28846ed5edcc6cc4b408883752afa82c6284ba1adf717f6d4f6e13142feacf781c522fb556880bab0c0f17181acf5b2c2e79bc3708261e7e7d38dde350'
    };

    const client = {
        serverPubKey: serverKey.pub,
        keyPair: clientKey,
        innerEncrypt: 0,
        params: {
            protocol: {
                version: "1.1.1",
                type: "u.protocols.gingerbread",
            },
            rootNodeId: "hello1"
        }
    };

    const server = {
        keyPair: serverKey,
        accept: [
            {
                clientPubKey: ["nokey", clientKey.pub],
                name: "my server",
                innerEncrypt: 0,
                params: [
                    {
                        protocol: {
                            version: "1.1.1",
                            type: "u.protocols.gingerbread",
                        },
                        rootNodeId: "hello1",
                        // depths>0 still untested here, it requires a working storage with data inside of it.
                        handshakeDepth: 0,
                        //rootNodeId: (serverParams, clientRootNodeId, clientPubKey) => "halloj",
                    }
                ]
            }
        ]
    };

    return handshake(client, server, messageCommC, messageCommS, serverKeyMismatch);
}

describe("Handshake", () => {
    describe("AsClient", () => {
        let messageCommC;
        let messageCommS;
        beforeEach(() => {
            [messageCommC, messageCommS] = createComms();

            messageCommC.cork();
            // Limit the size of transfer before disconnect to reduce DOS attacks.
            messageCommC.setBufferSize(2048);

            // Limit the size of transfer before disconnect to reduce DOS attacks.
            messageCommS.setBufferSize(2048);
            messageCommS.cork();
        });

        test("messageComm is undefined", async (done) => {
            messageCommC = undefined;
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == null);
            const p2 = await ret[1];
            assert(p2 == undefined);
            done();
        });

        test("messageComm is null", async (done) => {
            messageCommC = null;
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == null);
            const p2 = await ret[1];
            assert(p2 == undefined);
            done();
        });

        test("messageComm is null", async (done) => {
            messageCommC = null;
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == null);
            const p2 = await ret[1];
            assert(p2 == undefined);
            done();
        });

        test("messageComm send failure", async (done) => {
            messageCommC.send = function() {
                return AsyncRet.Exception("messageComm send failure");
            };
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == null);
            const p2 = await ret[1];
            assert(p2 == undefined);
            done();
        });

        test("server key mismatch", async (done) => {
            const ret = main(messageCommC, messageCommS, true);
            const p1 = await ret[0];
            assert(p1 == null);
            const p2 = await ret[1];
            assert(p2 == undefined);
            done();
        });

        test.skip("client side", async (done) => {
            const p = main(messageCommC, messageCommS);
            const p1 = await p[0];
            assert(p1 == undefined);
            done();
        });
    });

    describe("AsServer", () => {
        let messageCommC;
        let messageCommS;
        beforeEach(() => {
            [messageCommC, messageCommS] = createComms();

            messageCommC.cork();
            // Limit the size of transfer before disconnect to reduce DOS attacks.
            messageCommC.setBufferSize(2048);

            // Limit the size of transfer before disconnect to reduce DOS attacks.
            messageCommS.setBufferSize(2048);
            messageCommS.cork();
        });

        test("messageComm is undefined", async (done) => {
            messageCommS = undefined;
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == null);
            const p2 = await ret[1];
            assert(p2 == undefined);
            done();
        });

        test("messageComm is null", async (done) => {
            messageCommS = null;
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == undefined);
            const p2 = await ret[1];
            assert(p2 == null);
            done();
        });

        test("messageComm is null", async (done) => {
            messageCommS = null;
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == undefined);
            const p2 = await ret[1];
            assert(p2 == null);
            done();
        });

        test("messageComm send failure", async (done) => {
            messageCommS.send = function() {
                return AsyncRet.Exception("messageComm send failure");
            };
            const ret = main(messageCommC, messageCommS);
            const p1 = await ret[0];
            assert(p1 == undefined);
            const p2 = await ret[1];
            assert(p2 == null);
            done();
        });

        test.skip("server side", async (done) => {
            const p = main(messageCommC, messageCommS);
            const p1 = await p[0];
            assert(p1 == undefined);
            done();
        });
    });
});
