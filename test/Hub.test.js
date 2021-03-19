const assert = require("assert");
const Hub = require("../Hub");

describe("Hub", () => {
    describe("HubServer", () => {
        test("missing servers", () => {
            assert.doesNotThrow(() => Hub.HubServer());
        });

        test("empty servers", () => {
            assert.doesNotThrow(() => Hub.HubServer([]));
        });

        test("missing listen attribute", () => {
            assert.doesNotThrow(() => Hub.HubServer([
                {
                    "name": "1"
                },
                {
                    "name": "2"
                },
                {
                    "name": "3"
                }
            ]));
        });

        test("missing listen protocol attribute", () => {
            assert.doesNotThrow(() => Hub.HubServer([
                {
                    "name": "1",
                    "listen": null
                },
                {
                    "name": "2",
                    "listen": null
                },
                {
                    "name": "3",
                    "listen": null
                }
            ]));
        });

        test("unknown listen protocol attribute", () => {
            assert.doesNotThrow(() => Hub.HubServer([
                {
                    "name": "1",
                    "listen":  {
                        "protocol": "badvalue"
                    }
                },
                {
                    "name": "2",
                    "listen":  {
                        "protocol": "badvalue"
                    }
                },
                {
                    "name": "3",
                    "listen":  {
                        "protocol": "badvalue"
                    }
                }
            ]));
        });

        test("valid listen protocol attribute missing port", () => {
            assert.throws(() => Hub.HubServer([
                {
                    "name": "1",
                    "listen":  {
                        "protocol": "tcp"
                    }
                },
                {
                    "name": "2",
                    "listen":  {
                        "protocol": "tcp"
                    }
                },
                {
                    "name": "3",
                    "listen":  {
                        "protocol": "tcp"
                    }
                }
            ]), /port must be a number/);
        });

        // TODO: FIXME: stop listening after assertions
        test.skip("tcp listen protocol attribute with valid port", () => {
            assert.doesNotThrow(() => Hub.HubServer([
                {
                    "name": "1",
                    "listen":  {
                        "protocol": "tcp",
                        "port": 8889
                    }
                }
            ]));
        });

        // TODO: FIXME: stop listening after assertions
        test.skip("websocket listen protocol attribute with valid port", () => {
            assert.doesNotThrow(() => Hub.HubServer([
                {
                    "name": "1",
                    "listen":  {
                        "protocol": "websocket",
                        "port": 8890
                    }
                }
            ]));
        });
    });

    describe("HubClient", () => {
        test("missing want argument", async (done) => {
            try {
                await Hub.HubClient();
            } catch(e) {
                assert(e == "Expecting MessageComm");
                done();
                return;
            }
            assert(false);
        });

        test("missing offer argument", async (done) => {
            try {
                await Hub.HubClient("wantdata");
            } catch(e) {
                assert(e == "Expecting MessageComm");
                done();
                return;
            }
            assert(false);
        });

        test("bad forceServer argument", async (done) => {
            try {
                await Hub.HubClient("wantdata", [], null, 1);
            } catch(e) {
                assert(e == "Expecting MessageComm");
                done();
                return;
            }
            assert(false);
        });

        test("missing MessageComm argument", async (done) => {
            try {
                await Hub.HubClient("wantdata", [], null, false);
            } catch(e) {
                assert(e == "Expecting MessageComm");
                done();
                return;
            }
            assert(false);
        });

        test("isSuccess false message exchange", async (done) => {
            const messageComm = {
                "sendMessage": jest.fn(() => {
                    return {
                        isSuccess: function(){
                            return false
                        },
                        errorMessage: function(){
                            return ""
                        }
                    };
                })
            };

            try {
                const status = await Hub.HubClient("wantdata", [], messageComm, false);
                assert(status == null);
            } catch(e) {
                assert(false);
            }

            done();
        });

         test("isSuccess true message exchange", async (done) => {
            const messageComm = {
                "sendMessage": jest.fn(() => {
                    return {
                        isSuccess: function(){
                            return true;
                        },
                        getProps: function(){
                            return {
                                "isServer": false
                            };
                        }
                    };
                })
            };

            try {
                const status = await Hub.HubClient("wantdata", [], messageComm, false);
                assert(status == false);
            } catch(e) {
                assert(false);
            }

            done();
        });
    });
});
