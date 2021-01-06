/**
 * Exception error type
 * @constant
 * @type {string}
 * @default
 */
const ERROR_EXCEPTION   = "exception";

/**
 * Socket error type
 * @constant
 * @type {string}
 * @default
 */
const ERROR_SOCKET      = "socket";

/**
 * Timeout error type
 * @constant
 * @type {string}
 * @default
 */
const ERROR_TIMEOUT     = "timeout";

/**
 * Busy error type
 * @constant
 * @type {string}
 * @default
 */
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
     * Checks for success in communication.
     * It does not necessarily mean the call went as expected, it means that there was no abrupt error on the way.
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
     * @return {boolean} true if exception type of error.
     */
    isException()
    {
        return (this.props._error || {}).type === ERROR_EXCEPTION;
    }

    /**
     * Specifically query if there is a socket error.
     * @return {boolean} true if socket type of error.
     */
    isSocketError()
    {
        return (this.props._error || {}).type === ERROR_SOCKET;
    }

    /**
     * Query for timeout error.
     * @return {boolean} true if timeout type of error.
     */
    isTimeout()
    {
        return (this.props._error || {}).type === ERROR_TIMEOUT;
    }

    /**
     * Query for busy error.
     * @return {boolean} true if busy type of error.
     */
    isBusy()
    {
        return (this.props._error || {}).type === ERROR_BUSY;
    }

    /**
     * Get the simple value set when instantiating with Success(value).
     * @return {string|number|boolean|Array|Buffer|null|undefined} - Success value
     */
    get()
    {
        return this.props._ret;
    }

    /**
     * Retrieve error message, if available.
     * @return {string | undefined} - error message.
     */
    errorMessage()
    {
        return (this.props._error || {}).msg;
    }

    /**
     * Retrieve error type, if available.
     * @return {string | undefined} - error type.
     */
    errorType()
    {
        return (this.props._error || {}).type;
    }

    /**
     * Retrieve object props.
     * @return {Object} - object props.
     */
    getProps()
    {
        const props = {};
        Object.keys(this.props).forEach(key => props[key] = this.props[key]);
        return props;
    }

    /**
     * Retrieve message id.
     * @return {string} - message id.
     */
    msgId()
    {
        return this._msgId;
    }
}

/**
 * Return an error struct which indicates a socket error.
 * @param {string} e - error message.
 * @return {AsyncRet} with "_error" property as object property.
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

/**
 * Returns an exception AsyncRet error object
 * @param {string} e - error message.
 * @return {AsyncRet} with "_error" property as object property.
 */
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

/**
 * Returns a Timeout AsyncRet error object
 * @param {string} e - error message.
 * @return {AsyncRet} with "_error" property as object property.
 */
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

/**
 * Returns a Busy AsyncRet error object
 * @param {string} e - error message.
 * @return {AsyncRet} with "_error" property as object property.
 */
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
 * Create an instance and set the input value as only property.
 * This is a sugar function to be used when wanting to return simple values.
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


    if (value === undefined) {
        return new AsyncRet({});
    }
    return new AsyncRet({_ret: value});
}

/*
 * We use this to set the complete data object of this instance, which is useful for restoring an instance from another.
 *
 * FYI: If the property "_error" is set in props then the isSuccess() call will return false.
 * FYI: If the property "_ret" is set in props then the get() call will return that value.
 *
 * @param {Object} props - object of properties
 * @param {string} msgId - set on replies over socket.
 * @return {AsyncRet} containing either "_error" or "_ret" properties set.
 */
function fromProps(props, msgId)
{
    if (typeof props !== "object") {
        throw "fromProps must be passed an object.";
    }
    return new AsyncRet(props || {}, msgId);
}

module.exports = {Success, Exception, SocketError, fromProps, Timeout, Busy};
