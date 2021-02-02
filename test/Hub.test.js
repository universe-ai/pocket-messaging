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
});
