#!/usr/bin/env node

const AbstractAgent = require("../AbstractAgent");
const assert = require("assert");

class TestAgent extends AbstractAgent
{
}

const config = {
    "servers": [
        {
            "keyPair": {
                "pub": "one",
                "priv": "two"
            },
            "listen":  {
                "protocol": "tcp",
                "host": "localhost",
                "port": 8080,
                "cert": "self-signed-cert",
                "key": "self-signed-key"
            },
            "accept": [
                {
                    "clientPubKey": "clientpubkey",
                    "name": "onConnect-name",
                    "innerEncrypt": 1,
                    "params": [
                        {
                            "data": "value"
                        }
                    ]
                }
            ]
        }
    ],
    "clients": [
        {
            "keyPair": {
                "pub": "drei",
                "priv": "vier"
            },
            "name": "clientName0",
            "serverPubKey": "serverpubkey",
            "innerEncrypt": 1,
            "connect": {
                "protocol": "tcp",
                "reconnect": true,
                "host": "universaltest.com",
                "port": 8080,
                "secure": true,
                "rejectUnauthorized": true,
                "cert": "self-signed-cert",
                "key": "self-signed-key",
                "ca": "self-signed-ca",
                "hub": {
                    "sharedSecret": "hotsauce"
                }
            },
            "params": {
                "dataclient": "valueclient"
            }
        }
    ]
};

describe("AbstractAgent", () => {
    describe("constructor", () => {
        test("missing config parameter", () => {
            assert.throws(() => new TestAgent(), /Invalid config/);
        });

        test("empty config parameter", () => {
            const config = {};
            const agent = new TestAgent(config);
            assert(agent.config.toString() == config.toString());
            assert(Array.isArray(agent.config.servers));
            assert(agent.config.servers.length == 0);
            assert(Array.isArray(agent.config.clients));
            assert(agent.config.clients.length == 0);

            assert(Array.isArray(agent.serverSockets));
            assert(Array.isArray(agent.clientSockets));
            assert(agent.serverSockets.length == 0);
            assert(agent.clientSockets.length == 0);

            assert(typeof agent.onConnectedEvents == "object");
            assert(typeof agent.onConnectFailureEvents == "object");
        });

        test("valid config", () => {
            const agent = new TestAgent(config);
            assert(agent.config.toString() == config.toString());
            assert(Array.isArray(agent.config.servers));
            assert(agent.config.servers.length == 1);
            assert(agent.config.servers[0].keyPair.pub == "one");
            assert(agent.config.servers[0].keyPair.priv == "two");
            assert(agent.config.servers[0].listen.protocol == "tcp");
            assert(agent.config.servers[0].listen.host == "localhost");
            assert(agent.config.servers[0].listen.port == 8080);
            assert(agent.config.servers[0].listen.cert == "self-signed-cert");
            assert(agent.config.servers[0].listen.key == "self-signed-key");
            assert(Array.isArray(agent.config.servers[0].accept));
            assert(agent.config.servers[0].accept[0].clientPubKey == "clientpubkey");
            assert(agent.config.servers[0].accept[0].name == "onConnect-name");
            assert(agent.config.servers[0].accept[0].innerEncrypt == 1);
            assert(Array.isArray(agent.config.servers[0].accept[0].params));
            assert(agent.config.servers[0].accept[0].params[0].data == "value");

            assert(Array.isArray(agent.config.clients));
            assert(agent.config.clients.length == 1);
            assert(agent.config.clients[0].keyPair.pub == "drei");
            assert(agent.config.clients[0].keyPair.priv == "vier");
            assert(agent.config.clients[0].name == "clientName0");
            assert(agent.config.clients[0].serverPubKey == "serverpubkey");
            assert(agent.config.clients[0].innerEncrypt == 1);
            assert(agent.config.clients[0].connect.protocol == "tcp");
            assert(agent.config.clients[0].connect.reconnect == true);
            assert(agent.config.clients[0].connect.host == "universaltest.com");
            assert(agent.config.clients[0].connect.port == 8080);
            assert(agent.config.clients[0].connect.secure == true);
            assert(agent.config.clients[0].connect.rejectUnauthorized == true);
            assert(agent.config.clients[0].connect.cert == "self-signed-cert");
            assert(agent.config.clients[0].connect.key == "self-signed-key");
            assert(agent.config.clients[0].connect.ca == "self-signed-ca");
            assert(agent.config.clients[0].connect.hub.sharedSecret == "hotsauce");
            assert(agent.config.clients[0].params.dataclient == "valueclient");

            assert(Array.isArray(agent.serverSockets));
            assert(Array.isArray(agent.clientSockets));
            assert(agent.serverSockets.length == 0);
            assert(agent.clientSockets.length == 0);

            assert(typeof agent.onConnectedEvents == "object");
            assert(typeof agent.onConnectFailureEvents == "object");
        });
    });

    describe("start", () => {
        test("empty config", () => {
            const agent = new TestAgent({});
            assert(agent.serverSockets.length == 0);
            assert(agent.clientSockets.length == 0);
            agent.start();
            assert(agent.serverSockets.length == 0);
            assert(agent.clientSockets.length == 0);
        });

        // TODO: FIXME: requires server instantiation and networking to be mocked
        test.skip("successful call", () => {
            const agent = new TestAgent(config);
            assert(agent.serverSockets.length == 0);
            assert(agent.clientSockets.length == 0);
            agent.start();
            assert(agent.serverSockets.length == 1);
            assert(agent.clientSockets.length == 1);
        });
    });

    describe("stop", () => {
        test("successful call", () => {
            const agent = new TestAgent(config);
            assert(agent.isStopped == false);
            agent.stop();
            assert(agent.isStopped == true);

        });
    });

    describe("onConnect", () => {
        test("unnamed successful call on empty data", () => {
            const agent = new TestAgent(config);
            assert(!agent.onConnectedEvents["*"]);
            agent.onConnect(function() {});
            assert(agent.onConnectedEvents["*"]);
            assert(agent.onConnectedEvents["*"].length == 1);
        });
           
        test("successful call on empty data", () => {
            const agent = new TestAgent(config);
            assert(!agent.onConnectedEvents["name"]);
            agent.onConnect(function() {}, "name");
            assert(agent.onConnectedEvents["name"]);
            assert(agent.onConnectedEvents["name"].length == 1);
        });

        test("successful call on existing data", () => {
            const agent = new TestAgent(config);
            assert(!agent.onConnectedEvents["name"]);
            agent.onConnect(function() {}, "name");
            assert(agent.onConnectedEvents["name"]);
            assert(agent.onConnectedEvents["name"].length == 1);
            agent.onConnect(function() {}, "name");
            assert(agent.onConnectedEvents["name"].length == 2);
        });
    });

    describe("onError", () => {
        test("unnamed successful call on empty data", () => {
            const agent = new TestAgent(config);
            assert(!agent.onConnectFailureEvents["*"]);
            agent.onError(function() {});
            assert(agent.onConnectFailureEvents["*"]);
            assert(agent.onConnectFailureEvents["*"].length == 1);
        });
           
        test("successful call on empty data", () => {
            const agent = new TestAgent(config);
            assert(!agent.onConnectFailureEvents["name"]);
            agent.onError(function() {}, "name");
            assert(agent.onConnectFailureEvents["name"]);
            assert(agent.onConnectFailureEvents["name"].length == 1);
        });

        test("successful call on existing data", () => {
            const agent = new TestAgent(config);
            assert(!agent.onConnectFailureEvents["name"]);
            agent.onError(function() {}, "name");
            assert(agent.onConnectFailureEvents["name"]);
            assert(agent.onConnectFailureEvents["name"].length == 1);
            agent.onError(function() {}, "name");
            assert(agent.onConnectFailureEvents["name"].length == 2);
        });
    });

    describe("_setupServerListeners", () => {
        test("empty config", () => {
            const agent = new TestAgent({});
            assert(agent.serverSockets.length == 0);
            agent._setupServerListeners();
            assert(agent.serverSockets.length == 0);
        });

        // TODO: FIXME: requires server instantiation and networking to be mocked
        test.skip("successful call", () => {
            const agent = new TestAgent(config);
            assert(agent.serverSockets.length == 0);
            agent._setupServerListeners();
            assert(agent.serverSockets.length == 1);
        });
    });

    describe("_attemptClientConnections", () => {
        test("empty config", () => {
            const agent = new TestAgent({});
            assert(agent.clientSockets.length == 0);
            agent.start();
            assert(agent.clientSockets.length == 0);
        });

        // TODO: FIXME: requires server instantiation and networking to be mocked
        test.skip("successful call", () => {
            const agent = new TestAgent(config);
            assert(agent.clientSockets.length == 0);
            agent.start();
            assert(agent.clientSockets.length == 1);
        });
    });

    describe("_connected", () => {
        test("successful call", () => {
            const agent = new TestAgent(config);
            let data = "";
            agent.onConnect(function(name, input) {
                data = input;
            }, "name");
            assert(data == "");
            agent._connected("name", "datainput");
            assert(data == "datainput");
        });
    });

    describe("_connectFailure", () => {
        test("successful call", () => {
            const agent = new TestAgent(config);
            let data = "";
            agent.onError(function(err) {
                data = err;
            }, "name");
            assert(data == "");
            agent._connectFailure("name", "bad error");
            assert(data.origin == "Agent");
            assert(data.errorType == "connection");
            assert(data.msg == "bad error");
            assert(data.name == "name");
        });
    });
});
