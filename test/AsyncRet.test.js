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

    describe("Error", () => {
        test("input is string", () => {
            assert.doesNotThrow(() => {
                const data = AsyncRet.Error("it is an error");
                assert(data.message == "it is an error");
            });
        });
    });
});
