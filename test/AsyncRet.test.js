const assert = require("assert");
const AsyncRet = require("../AsyncRet");

describe("AsyncRet", () => {
    describe("Success", () => {
        test("value is undefined", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success();
                assert(data.props._ret == undefined);
                assert(!data._msgId);
            });
        });

       test("value is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success(null);
                assert(data.props._ret == null);
                assert(!data._msgId);
            });
        });

       test("value is string", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success("value");
                assert(data.props._ret == "value");
                assert(!data._msgId);
            });
        });

       test("value is number", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success(9);
                assert(data.props._ret == 9);
                assert(!data._msgId);
            });
        });

       test("value is boolean", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success(true);
                assert(data.props._ret == true);
                assert(!data._msgId);
            });
        });

       test("value is Array", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success([1,2,3]);
                assert(data.props._ret.length == 3);
                assert(!data._msgId);
            });
        });

       test("value is Buffer", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Success(Buffer.from("value"));
                assert(data.props._ret.toString() == Buffer.from("value").toString());
                assert(!data._msgId);
            });
        });

       test("value is Object", () => {
            assert.throws(() => AsyncRet.Success({"test": 123}), /Could not set Success value, objects not allowed as value./);
        });
    });

    describe("Exception", () => {
        test("input is undefined", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Exception();
                assert(data.isError());
                assert(data.isException());
                assert(!data.errorMessage());
                assert(!data.props._ret);
                assert(!data.props._error.msg);
            });
        });

        test("input is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Exception(null);
                assert(data.isError());
                assert(data.isException());
                assert(!data.props._ret);
                assert(data.props._error.msg == null);
            });
        });

        test("input is string", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Exception("it is an exception");
                assert(data.isError());
                assert(data.isException());
                assert(!data.props._ret);
                assert(data.props._error.msg == "it is an exception");
            });
        });
    });

    describe("SocketError", () => {
        test("input is undefined", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.SocketError();
                assert(data.isSocketError());
                assert(!data.props._ret);
                assert(!data.props._error.msg);
            });
        });

        test("input is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.SocketError(null);
                assert(data.isSocketError());
                assert(!data.props._ret);
                assert(data.props._error.msg == null);
            });
        });

        test("input is string", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.SocketError("it is a socket error");
                assert(data.isSocketError());
                assert(!data.props._ret);
                assert(data.props._error.msg == "it is a socket error");
            });
        });
    });

    describe("fromProps", () => {
        test("props is undefined", () => {
            assert.throws(() => AsyncRet.fromProps(), /fromProps must be passed an object./);
        });

        test("props is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.fromProps(null);
                assert(data.props._ret == null);
                assert(!data._msgId);
            });
        });

        test("props is string", () => {
            assert.throws(() => AsyncRet.fromProps("not an object"), /fromProps must be passed an object./);
        });

        test("props is object contains _ret", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.fromProps({_ret: 3});
                assert(data.get() == 3);
                assert(data.props._ret == 3);
                assert(!data._msgId);
            });
        });

        test("props is object contains _error", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.fromProps({
                    _error: {
                        type: "socket",
                        msg: "An error message"
                    }
                });
                assert(data.isSuccess() == false);
                assert(data.errorMessage() == "An error message");
                assert(data.errorType() == "socket");
                assert(data.props._error.msg == "An error message");
                assert(data.isSocketError());
                assert(!data._msgId);
            });
        });

        test("msgId is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.fromProps({_ret: 3}, null);
                assert(data.get() == 3);
                assert(data.props._ret == 3);
                assert(data._msgId == null);
            });
        });

        test("msgId is set", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.fromProps({_ret: 3}, 111222333);
                assert(data.get() == 3);
                assert(data.getProps()._ret == 3);
                assert(data.msgId() == 111222333);
                assert(data.props._ret == 3);
                assert(data._msgId == 111222333);
            });
        });
    });

    describe("Timeout", () => {
        test("input is undefined", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Timeout();
                assert(data.isTimeout());
                assert(!data.props._ret);
                assert(!data.props._error.msg);
            });
        });

        test("input is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Timeout(null);
                assert(data.isTimeout());
                assert(!data.props._ret);
                assert(data.props._error.msg == null);
            });
        });

        test("input is string", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Timeout("it is a socket error");
                assert(data.isTimeout());
                assert(!data.props._ret);
                assert(data.props._error.msg == "it is a socket error");
            });
        });
    });

    describe("Busy", () => {
        test("input is undefined", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Busy();
                assert(!data.props._ret);
                assert(!data.props._error.msg);
                assert(data.props._error.type == "busy");
            });
        });

        test("input is null", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Busy(null);
                assert(!data.props._ret);
                assert(data.props._error.msg == null);
                assert(data.props._error.type == "busy");
            });
        });

        test("input is string", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Busy("it is a socket error");
                assert(!data.props._ret);
                assert(data.props._error.msg == "it is a socket error");
                assert(data.props._error.type == "busy");
            });
        });
    });
});
