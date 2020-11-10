const ERROR_EXCEPTION   = "exception";
const ERROR_SOCKET      = "socket";
const ERROR_TIMEOUT     = "timeout";
const ERROR_BUSY        = "busy";

/**
 * Data holder for returning data over asynchronous boundaries.
 */
class AsyncRet
{
    /**
     * @param {object} props
     * @param {string} [msgId] can be set but is not part of the properties
     */
    constructor(props, msgId)
    {
        this.props = {};
        Object.keys(props || {}).forEach(key => this.props[key] = props[key]);
        if (msgId) {
            this._msgId = msgId;
        }
    }

    /**
     * Checks for success in communication,
     * it does not necessarily mean the call went as expected, it means that there was no abrupt error on the way.
     *
     * @return {boolean} true if no errors are set
     */
    isSuccess()
    {
        return this.props._error == null;
    }

    /**
     * Returns true if any error is set
     *
     * @return {boolean} true if any error is set
     */
    isError()
    {
        return !this.isSuccess();
    }

    /**
     * Specifically query if there is an exception.
     */
    isException()
    {
        return (this.props._error || {}).type === ERROR_EXCEPTION;
    }

    /**
     * Specifically query if there is a socket error.
     */
    isSocketError()
    {
        return (this.props._error || {}).type === ERROR_SOCKET;
    }

    isTimeout()
    {
        return (this.props._error || {}).type === ERROR_TIMEOUT;
    }

    /**
     * Get the simple value set when instantiating with Success(value).
     *
     */
    get()
    {
        return this.props._ret;
    }

    errorMessage()
    {
        return (this.props._error || {}).msg;
    }

    errorType()
    {
        return (this.props._error || {}).type;
    }

    getProps()
    {
        const props = {};
        Object.keys(this.props).forEach(key => props[key] = this.props[key]);
        return props;
    }

    msgId()
    {
        return this._msgId;
    }
}

/**
 * Return an error struct which indicates a socket error.
 */
function SocketError(e)
{
    const props = {
        _error: {
            type: ERROR_SOCKET,
            msg: e
        }
    };
    return new AsyncRet(props);
}

function Exception(e)
{
    const props = {
        _error: {
            type: ERROR_EXCEPTION,
            msg: e
        }
    };
    return new AsyncRet(props);
}

function Timeout(e)
{
    const props = {
        _error: {
            type: ERROR_TIMEOUT,
            msg: e
        }
    };
    return new AsyncRet(props);
}

function Busy(e)
{
    const props = {
        _error: {
            type: ERROR_BUSY,
            msg: e
        }
    };
    return new AsyncRet(props);
}

/**
 * Create an instance and set a scalar, Array or Buffer value as only property.
 * This is a suger function to be used when wanting to return simple values.
 *
 * If an array is holding a Buffer object, it MUST be unnested as a direct element of the array,
 * it cannot be held by a sub array or by an object in the array.
 * This is very important otherwise the packing/unpacking will not work.
 *
 * This function does not support setting objects, use setProps() for that.
 *
 * @param {string|number|boolean|Array|Buffer|null|undefined} value
 *  This is a quick way of setting a single value and later retrieving it with get().
 *  Refrain from putting any complex objects here because it becomes hard to understand the underlaying API.
 *  When making into a Message this translates to message.add("_ret", value), meaning all restrictions
 *  and recommendations from using message.add() applies to this value too.
 *
 * @return {AsyncRet} with "_ret" property set to value.
 */
function Success(value)
{
    if (value === undefined || value === null) {
        // Pass
    }
    else if (typeof value === "string") {
        // Pass
    }
    else if (typeof value === "number") {
        // Pass
    }
    else if (typeof value === "boolean") {
        // Pass
    }
    else if (Array.isArray(value)) {
        // Pass
    }
    else if (value instanceof Buffer) {
        // Pass
    }
    else {
        throw "Could not set Success value, objects not allowed as value.";
    }

    return new AsyncRet({_ret: value});
}

/*
 * We use this to set the complete data object of this instance, which is useful for restoring an instance from another.
 *
 * FYI: If the property "_error" is set in props then the success() call will return false.
 * FYI: If the property "_ret" is set in props then the get() call will return that value.
 *
 * @param {Object | null} props object of properties
 * @param {string | null} msgId Is set on replies over socket.
 */
function fromProps(props, msgId)
{
    if (typeof props !== "object") {
        throw "fromProps must be passed an object.";
    }
    return new AsyncRet(props || {}, msgId);
}

module.exports = {Success, Error, Exception, SocketError, fromProps, Timeout, Busy};
