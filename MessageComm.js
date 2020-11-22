const AsyncRet = require("./AsyncRet");
const {MessageDecoder} = require("./Message");
const {MessageEncoder} = require("./Message");
const assert = require("assert");
const nacl = require("tweetnacl");
const Logger = require("../logger/Logger");
const Hash = require("../util/hash");

class MessageComm
{
    /**
     * @callback RouteMessageCallback
     * @param  {object} action - message action.
     * @param  {number} msgId - message id.
     * @param  {Array}  data - message data.
     */

    /**
     * @param {Socket} socket
     * @param {RouteMessageCallback} [routeMessage] - Can be set or reset after initialization.
     */
    constructor(socket, routeMessage)
    {
        if (!socket) {
            throw "Referencing an existing socket is required for initialization.";
        }

        this.socket = socket;
        this.routeMessage = routeMessage;
        this.isClosed = false;
        this.msgsInFlight = {};
        this.incomingBuffers = [];  // Incoming data buffered
        this.decryptedBuffers = [];  // Incoming data decrypted or just copied if no encryption.
        this.defaultTimeout = 10;   // Seconds
        this.busyCount = {};  // Throttle incoming actions
        this.eventHandlers  = {};
        this.routeLimit = -1;
        this.routeAsBinary = false;  // Special routing mode

        /** Encryption parameters if used */
        this.encrypt = null;

        /** Perform ping-pong to check socket liveness */
        this.pingPong = true;

        /** Seconds of inactivity after which we do a ping-pong */
        this.inactivityThreshold = 300;

        this.lastActivity = 0;

        // Default 100 MiB buffering.
        // When using encryption the need for buffering will be larger,
        // good to know if working on the margins.
        this.defaultMaxBufferSize = 1024 * 1024 * 100;

        // Max bytes buffered in MessageComm.
        // Messages arriving which headers are decoded will have their length compared to
        // this value even before the rest of the message data is read.
        // If this value is overflowed then the socket will be disconnected.
        // This is a security feature so we can limit the incoming flow.
        // It is not a pause/resume feature and cannot be used to throttle the flowrate.
        //
        // 0 = uncapped.
        this.maxBufferSize = this.defaultMaxBufferSize;

        this.instanceId = Hash.generateRandomHex(4);

        const loggerId = `${(this).constructor.name}:${this.instanceId}`;
        this.logger = Logger(loggerId, ( (process ? process.env : window) || {} ).LOG_LEVEL );

        this._onData = this._onData.bind(this);
        this._checkTimeouts = this._checkTimeouts.bind(this);
        this._checkInactivity = this._checkInactivity.bind(this);

        this.socket.onData(data => this._onData(data));
        this.socket.onDisconnect( () => this._onDisconnect());
        this.socket.onError(msg => { this.logger.error("Socket error"); this._onDisconnect(); });

        this._setupJanitorChannel();

        this._checkTimeouts();
    }

    /**
     * Create a message which the peer MessageComm can reply to for system type of actions.
     * The action we support now is the ping-pong.
     */
    _setupJanitorChannel()
    {
        // This won't send anything on socket but will register the message so we can handle callbacks.
        // Since we are sending empty data, this send will get a return directly, meaning later replies
        // we send will get to the callback (2nd reply onwards).
        this.send([], "00000000", 0, (asyncRet) => {
            if (asyncRet.isSuccess()) {
                const props = asyncRet.getProps();
                if (props.action === "ping") {
                    const message = new MessageEncoder(asyncRet.msgId());
                    message.addString("action", "pong");
                    this.sendMessage(message);
                }
            }
        });

        this.lastActivity = Date.now();
        this._checkInactivity();
    }

    async _checkInactivity()
    {
        if (this.pingPong && Date.now() > this.lastActivity + this.inactivityThreshold * 1000) {
            const message = new MessageEncoder("00000000");
            message.addString("action", "ping");
            const asyncRet = await this.sendMessage(message, true, 10);
            if (!asyncRet.isSuccess()) {
                this.logger.error("Socket timeouted of inactivity, closing it.");
                this.socket.disconnect();
                return;
            }
        }
        if (!this.isClosed) {
            setTimeout(this._checkInactivity, 1000);
        }
    }

    /**
     * Send packed message data buffers on socket.
     *
     * Also, possibly setup a hook for a reply and also possibly for continuous callbacks.
     *
     * The data buffers come from a packed message.
     * However, the MessageComm can also be put in a binary mode where message unpacking is not attempted.
     *
     * A message can have it's action field set to the incomig msg ID, in which case
     * it will be seen as a reply when the peer is receiving it.
     *
     * @param {Array<Buffer>} buffers - data buffers to be sent
     *
     * @param {string} [msgId] set to the msgId of the packed message, if we are expecting a reply
     *
     * @param {number | null} [timeout] set to have a timeouted auto reply after x seconds without a first reply.
     *  Defaults to 10 seconds if set to null. Set to 0 for no timeout.
     *  When timeouted the caller will resolve its promise to an AsyncRet.Timeout().
     *
     * @param {Function | null} [callback] function invoked from 2nd reply and onwards.
     *  Signature AsyncRet(data, msgId (of incoming message)) if the callback returns exactly false that indicates no more replies accepted
     *  and the message will be removed from storage.
     *
     * @param {number | null} [callbackTimeout] set to have continuous timeouted auto replies on the callback on a x seconds interval.
     *  Set to 0 or null for no timeout.
     *  When timeouted the caller will invoke the callback function with an AsyncRet.Timeout().
     *  When a regular message is recieved for the callback the timeout counter is reset, meaning timeout messages are only sent if no
     *  other message has arrived within the timeout interval.
     *
     * @return {Promise<AsyncRet> | AsyncRet} If no reply is expected (no msgId set) then return AsyncRet.Success() or AsyncRet.Exception()/AsyncRet.SocketError() on error.
     *  If the caller is expecting a reply then AsyncRet will be forwarded from the replying peer plus that the msgId of the reply will be set in the AsyncRet object.
     *  Other possible returns to waiting caller are AsyncRet.Busy() and AsyncRet.Timeout().
     *  If the data buffers attempted to be sent are empty then a AsyncRet.Success() is returned.
     */
    send(buffers, msgId, timeout, callback, callbackTimeout)
    {
        if (this.isClosed) {
            const err = "Socket is closed.";
            this.logger.error(err);
            return AsyncRet.Exception(err);
        }

        if (!buffers) {
            // This is a catch-em-all for messages who could not pack properly, for whatever reason.
            const err = "Send buffers are null. Error in packing message?";
            this.logger.error(err);
            return AsyncRet.Exception(err);
        }

        // If we have not set msgId, it means we are not expecting a reply,
        // in such case neither callback or timeout should be set.
        if (!msgId) {
            if (callback || timeout != null || callbackTimeout != null) {
                const err = "msgId must also be set if expecting callback or timeout.";
                this.logger.error(err);
                return AsyncRet.Exception(err);
            }
        }
        else {
            if (this.msgsInFlight[msgId]) {
                return AsyncRet.Exception(`Message ID already in use: ${msgId}`);
            }
        }

        timeout = timeout == null ? this.defaultTimeout * 1000 : Number(timeout) * 1000;
        callbackTimeout = callbackTimeout == null ? 0 : Number(callbackTimeout) * 1000;

        let ret = AsyncRet.Success();

        // If the message ID is provided that means we are expecting a reply to the message.
        if (msgId) {
            this.msgsInFlight[msgId] = {onReply: null, onCallback: callback, timeout: timeout, callbackTimeout: callbackTimeout, lastActivity: Date.now()};
            // Note: it is crucial that the onReply is set before any reply is read back on socket.
            ret = new Promise( resolve => {
                // We call this send successfull straight away,
                // since there is not data sent on socket.
                if (buffers.length === 0) {
                    // Remove message if no callback was defined.
                    if (!callback) {
                        delete this.msgsInFlight[msgId];
                    }
                    resolve(AsyncRet.Success());
                }
                else {
                    this.msgsInFlight[msgId].onReply = resolve;
                }
            });
        }

        try {
            const encryptedBuffers = this._encryptBuffers(buffers);
            encryptedBuffers.forEach( buffer => {
                this.socket.send(buffer);
            });
        }
        catch(e) {
            // We force a disconnect if sending fails.
            // The disconnect will resolve any promises with a SocketError
            this.logger.error("Error writing on socket, disconnecting socket.");
            this.socket.disconnect();
            return AsyncRet.SocketError("Failed to send, disconnecting");
        }

        return ret;
    }

    /**
     * Sugar function for send() which takes a Message object.
     *
     * @param {MessageEncoder} message ready to be packed
     * @param {boolean} [expectReply] set to true if expecting a reply or callbacks.
     * @param {number | null} [timeout] set to have a timeouted auto reply after x seconds without a first reply.
     * @param {Function | null} [callback] function invoked from 2nd reply and onwards.
     * @param {number | null} [callbackTimeout] set to have continuous timeouted auto replies on the callback on a x seconds interval.
     * return {Promise<AsyncRet> | AsyncRet}
     * @throws An exception will be thrown when the resulting message length is bigger than MAX_MESSAGE_SIZE.
     */
    sendMessage(message, expectReply, timeout, callback, callbackTimeout)
    {
        if( ! (message instanceof MessageEncoder) ) {
            const type = typeof message;
            throw `Cannot send message of type ${type}. Expected message to be instanceof MessageEncoder`;
        }
        const packedBuffers = message.pack();
        assert((!expectReply && (expectReply === undefined || expectReply == false)) || (expectReply && typeof expectReply == "boolean"));
        return this.send(packedBuffers, expectReply && message.getMsgId(), timeout, callback, callbackTimeout);
    }

    /**
     * Sugar function for send() which takes an action and an object.
     *
     * @param {string} action - message action
     * @param {Object} object - message object
     * @param {boolean} expectReply set to true if expecting a reply or callbacks.
     * @param {number | null} [timeout] set to have a timeouted auto reply after x seconds without a first reply.
     * @param {Function | null} [callback] function invoked from 2nd reply and onwards.
     * @param {number | null} [callbackTimeout] set to have continuous timeouted auto replies on the callback on a x seconds interval.
     * return {Promise<AsyncRet> | AsyncRet}
     * @throws An exception will be thrown when action is not in a valid format or when, for some other reason, the MessageEncoder object was unable to be created.
     * @throws An exception will be thrown when object is not in a valid format, or when, for some other reason, the addObject call fails.
     * @throws An exception will be thrown when the resulting message length is bigger than MAX_MESSAGE_SIZE.
     */
    sendObject(action, object, expectReply, timeout, callback, callbackTimeout)
    {
        const message = new MessageEncoder(action);
        message.addObject("o", object);
        const packedBuffers = message.pack();
        return this.send(packedBuffers, expectReply && message.getMsgId(), timeout, callback, callbackTimeout);
    }

    /**
     * Remove a pending message from memory.
     *
     * Often a message is cleared by the callback function returning false, but it can be achieved also from the outside by calling this function.
     *
     * @param {string} msgId ID of the sent message.
     */
    clearPendingMessage(msgId)
    {
        delete this.msgsInFlight[msgId];
    }

    /**
     * Close the underlying socket.
     *
     */
    close()
    {
        assert(this.socket);
        this.socket.disconnect();
    }

    onDisconnect(fn)
    {
        this._on("disconnect", fn);
    }

    offDisconnect(fn)
    {
        this._off("disconnect", fn);
    }

    /**
     * Set the router function where incoming (non-reply) messages are routed.
     *
     * @param {Function} fn signature ({string} action, {string} msgId, {Object} props)
     * @param {boolean | null} routeAsBinary if set to true then the raw incoming buffers
     *  are routed to the function. The function then has the signature (Array<Buffer>).
     *  Any corking of messages is ignored for this mode.
     *  Any buffered data due to corking will be flushed to the router function when this mode
     *  is set.
     */
    setRouter(fn, routeAsBinary)
    {
        this.routeMessage = fn;
        this.routeAsBinary = routeAsBinary ? true : false;
        if (this.routeAsBinary) {
            // We trigger a read in case there is corked up data.
            this._onData();
        }
    }

    /**
     * Set the router in drain mode, all present and incoming data is discarded.
     * If MessageComm is corked, it will still be drained, but the cork settings
     * is preserved for when the drain is ended.
     * To end the drain and put the router back into normal mode call setRouter().
     */
    drain()
    {
        this.setRouter(null, true);
    }

    /**
     * Do not dispatch any messages to router, buffer them as they come.
     * This is not a pause/resume feature to put back pressure on the sender,
     * messages will still be tapped from wire and buffered here.
     */
    cork()
    {
        this.routeLimit = 0;
    }

    /**
     * Uncork message flow.
     * @param {number | null} [count] If positive then that is the nr of messages allowed to be uncorked. If -1 (or null) then allow unlimited messages to flow. If 0 then it's corked and no messages will flow.
     */
    uncork(count)
    {
        count = (count == null) ? -1 : count;
        this.routeLimit = count;
        this._onData();
    }

    /**
     * Check timeout for messages who have a timeout > 0.
     * A message waiting for its first reply will get removed if timeouted.
     * A callback timeout will invoke the onCallback with AsyncRet.Timeout() on ontervals, unless
     * there is activity of incoming messages within the time of the interval.
     */
    _checkTimeouts()
    {
        Object.keys(this.msgsInFlight).forEach( async msgId => {
            const msgInFlight = this.msgsInFlight[msgId];
            const lastActivity = msgInFlight.lastActivity;
            if (msgInFlight.onReply) {
                if (msgInFlight.timeout > 0 &&
                    Date.now() > msgInFlight.timeout + lastActivity) {

                    try {
                        msgInFlight.onReply(AsyncRet.Timeout());
                    }
                    catch(e) {
                    }
                    this.clearPendingMessage(msgId);
                }
            }
            else if (msgInFlight.onCallback) {
                if (msgInFlight.callbackTimeout > 0 &&
                    Date.now() > msgInFlight.callbackTimeout + lastActivity) {

                    msgInFlight.lastActivity = Date.now();
                    try {
                        const ret = await msgInFlight.onCallback(AsyncRet.Timeout());
                        // If a callback function return exactly false (not null nor undefined)
                        // then that signals that no further replies should be routed.
                        if (ret === false) {
                            this.clearPendingMessage(msgId);
                        }
                    }
                    catch(e) {
                    }
                }
            }
        });
        if (!this.isClosed) {
            setTimeout(this._checkTimeouts, 1000);
        }
    }

    _onData(buffer)
    {
        if (buffer != null) {
            if ( !(buffer instanceof Buffer) ) {
                throw "Socket error, Buffer not read";
            }
            if (buffer.length > 0) {
                this.lastActivity = Date.now();
                this.incomingBuffers.push(buffer);
                if (this.maxBufferSize > 0) {
                    let count = 0;
                    this.incomingBuffers.forEach( buffer => count = count + buffer.length );
                    if (count > this.maxBufferSize) {
                        this.logger.error("Buffer overload, disconnecting socket.");
                        this.socket.disconnect();
                        return;
                    }
                }
            }
        }

        // The router can be put in a special mode where it funnels all incoming data to the router as binary.
        if (this.routeAsBinary) {
            if (this.routeMessage) {
                if (!this._decryptBuffers()) {
                    return;
                }
                const arr = this.decryptedBuffers.slice();
                this.decryptedBuffers.length = 0;
                this.routeMessage(arr);
            }
            else {
                // If in binary mode without a router set we drain the pipes.
                this.incomingBuffers.length = 0;
            }
            return;
        }

        // Only decrypt/copy buffers for processing when not corked.
        // This is because one can cork the comm, then switch to encrypted mode
        // before uncorking it again. Those buffered up messages should be decrypted.
        if (this.routeLimit !== 0) {
            if (!this._decryptBuffers()) {
                return;
            }
        }

        if (this.isDecoding) {
            return;
        }
        this.isDecoding = true;
        while (this.routeLimit !== 0) {
            const message = this._decodeIncoming();
            if (message) {
                if (this.encrypt) {
                }
                if (this.routeLimit > 0) {
                    this.routeLimit--;
                }
                this._routeMessage(message);
            }
            else {
                break;
            }
        }
        this.isDecoding = false;
    }

    /**
     * Take incomingBuffers and decrypt (or just move) them to decryptedBuffers.
     * Some or all data can be left in incomingBuffers because we need complete
     * chunks to decrypt.
     */
    _decryptBuffers()
    {
        if (this.encrypt) {
            const decryptedBuffers = [];
            // Step over all incomingBuffers and see what we can decrypt.
            while(this.incomingBuffers.length > 0) {
                const buffer = this.incomingBuffers[0];
                if (buffer.length < 4) {
                    // Not enough data available.
                    return false;
                }
                let count = 0;
                this.incomingBuffers.forEach( buffer => count = count + buffer.length );
                const l = buffer.readUInt32LE();
                if (l > count) {
                    // Not enough data available.
                    return false;
                }
                //
                // Extract data
                const chunks = [];
                let remaining = l;
                while (remaining > 0) {
                    const buffer = this.incomingBuffers[0];
                    if (buffer.length <= remaining) {
                        chunks.push(buffer);
                        remaining = remaining - buffer.length;
                        this.incomingBuffers.shift();
                    }
                    else {
                        // Take part of buffer
                        const buffer2 = buffer.slice(0, remaining);
                        chunks.push(buffer2);
                        remaining = 0;
                        this.incomingBuffers[0] = buffer.slice(remaining);
                    }
                }
                const chunk = Buffer.concat(chunks);
                const nonce     = new Uint8Array(chunk.slice(4, 4 + nacl.secretbox.nonceLength));
                const message   = chunk.slice(4 + nacl.secretbox.nonceLength);
                // Decrypt data
                const decrypted = nacl.box.open(message, nonce,
                    this.encrypt.peerPublicKey,
                    this.encrypt.keyPair.secretKey);
                const decryptedBuffer = Buffer.alloc(decrypted.length);
                decryptedBuffer.set(decrypted);
                decryptedBuffers.push(decryptedBuffer);
            }
            this.decryptedBuffers.push(...decryptedBuffers);
        }
        else {
            this.decryptedBuffers.push(...this.incomingBuffers);
            this.incomingBuffers.length = 0;
        }
        return true;
    }

    /**
     * Encrypt or just copy buffers.
     * @param {Array<Buffer>} buffers
     */
    _encryptBuffers(buffers)
    {
        if (this.encrypt) {
            // Apply box
            const encryptedBuffers = [];

            let length = 0;
            let chunkBuffers = [];
            buffers.forEach( (buffer, index) => {
                length = length + buffer.length;
                chunkBuffers.push(buffer);

                // We chunk per MiB
                if (length >= 1024 * 1024 || index === buffers.length - 1) {
                    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
                    const chunk = Buffer.concat(chunkBuffers);
                    const box = nacl.box(chunk, nonce,
                        this.encrypt.peerPublicKey,
                        this.encrypt.keyPair.secretKey);

                    //
                    // Assemble final message
                    const l = 4 + nonce.length + box.length;
                    const encrypted = Buffer.alloc(l);
                    encrypted.writeUInt32LE(l);
                    encrypted.set(nonce, 4);
                    encrypted.set(box, 4 + nonce.length);
                    encryptedBuffers.push(encrypted);

                    chunkBuffers = [];
                    length = 0;
                }
            });

            return encryptedBuffers;
        }
        else {
            return buffers;
        }
    }

    _onDisconnect()
    {
        // Notify all messages pending reply
        Object.keys(this.msgsInFlight).forEach(msgId => {
            const msgInFlight = this.msgsInFlight[msgId];
            const onReply = msgInFlight.onReply;
            const onCallback = msgInFlight.onCallback;
            const asyncRet = AsyncRet.SocketError("Socket disconnected");
            if (onReply) {
                onReply(asyncRet);
            }
            else if (onCallback) {
                onCallback(asyncRet);
            }
            this.clearPendingMessage(msgId);
        });
        this.isClosed = true;
        this._triggerEvent("disconnect");
    }

    /**
     * Attempt at decoding an incoming message and pass it to its message handler.
     * Look at the initial frame to get the total length of the transfer.
     */
    _decodeIncoming()
    {
        try {
            const decoder = new MessageDecoder(this.decryptedBuffers);
            if (decoder.init() === false) {
                return null;
            }
            if (this.maxBufferSize > 0 && decoder.getLength() > this.maxBufferSize) {
                this.logger.error("Too large message getting fed on buffer, disconnecting socket.");
                this.socket.disconnect();
                return null;
            }
            if (decoder.isReady() === false) {
                return null;
            }
            const message = decoder.unpack();
            if (!message) {
                this.logger.warn("Could not unpack incoming message");
            }
            return message;
        }
        catch(e) {
            this.logger.error("Error parsing message from buffers, disconnecting socket.");
            this.socket.disconnect();
            return null;
        }
    }

    /**
     * Route incoming messages from the socket.
     * If action field matches a stored message ID then the incoming message
     * is treated as a reply.
     * A first reply will resolve the returned promise returned when calling send(),
     * any more replies will be routed to any callback function provided when calling send().
     * If the first reply is not successful then the message will be cleared from memory
     * so no callback can arrive.
     */
    async _routeMessage(message)
    {
        try {
            const [actionOrReplyMsgId, incomingMsgId, props] = message;
            const msgInFlight = this.msgsInFlight[actionOrReplyMsgId];
            if (msgInFlight) {
                msgInFlight.lastActivity = Date.now();
                const asyncRet = AsyncRet.fromProps(props, incomingMsgId);
                const onReply = msgInFlight.onReply;

                // If not a successful first reply then we will cancel any callback functionality.
                if (onReply && asyncRet.isSuccess() === false) {
                    delete msgInFlight.onCallback;
                }

                const onCallback = msgInFlight.onCallback;

                if (onReply) {
                    if (onCallback) {
                        // Only first reply is routed to onReply, if there are other replies
                        // then they will be passed to the callback function.
                        // So we remove the reference to signal that.
                        delete msgInFlight.onReply;
                    }
                    else {
                        // No more replies expected since there is no callback function.
                        this.clearPendingMessage(actionOrReplyMsgId);
                    }
                    onReply(asyncRet);
                }
                else if(onCallback) {
                    const ret = await onCallback(asyncRet);
                    // If a callback function return exactly false (not null nor undefined)
                    // then that signals that no further replies should be routed.
                    if (ret === false) {
                        this.clearPendingMessage(actionOrReplyMsgId);
                    }
                }
            }
            else {
                if (this.isBusy(actionOrReplyMsgId)) {
                    // Reply with a busy message and discard this message.
                    const asyncRet = AsyncRet.Busy();
                    const message = new MessageEncoder(incomingMsgId);
                    message.addProps(asyncRet.getProps());
                    this.sendMessage(message);
                }
                if (this.routeMessage) {
                    // inc busy
                    this._incBusy(actionOrReplyMsgId);
                    try {
                        await this.routeMessage(actionOrReplyMsgId, incomingMsgId, props);
                    }
                    catch(e) {
                        this.logger.error("Error routing message:", e);
                    }
                    this._decBusy(actionOrReplyMsgId);
                }
            }
        }
        catch(e) {
            this.logger.error("Error routing message:", e);
        }
    }

    _incBusy(action)
    {
        const o = this.busyCount[action];
        if (o) {
            o.count++;
        }
    }

    _decBusy(action)
    {
        const o = this.busyCount[action];
        if (o) {
            o.count--;
        }
    }

    isBusy(action)
    {
        const o = this.busyCount[action];
        if (o) {
            if (o.count >= o.max) {
                return true;
            }
        }
        return false;
    }

    /**
     * Limit the nr of message of a specific action being processed simultaneously.
     * Messages coming in after the limit has been reached will get an AsyncRet.Busy() returned.
     * This is how we trottle data on the socket, the sender side will need to slow down when it recives the busy notification.
     */
    throttleAction(action, max)
    {
        const o = this.busyCount[action] || {count: 0};
        o.max = max;
        this.busyCount[action] = o;
    }

    /**
     * Set the MessageComm in encrypted mode.
     * Data sent on socket will be encrypted and data decoded will first be decrypted.
     * Data is not decodes as it arrives, because of a corked MessageComm needs to be able to
     * enable encryption on already buffered up data.
     */
    setEncrypt(keyPair, peerPublicKey)
    {
        if (this.encrypt) {
            throw "MessageComm can only be set to encryption mode once, and it cannot be changed.";
        }

        // If there is any data in decryptedBuffers we need to move it back to the incomingBuffers
        // so that is actually gets decrypted and not just copied.
        this.incomingBuffers.unshift(...this.decryptedBuffers);
        this.decryptedBuffers.length = 0;

        this.encrypt = {
            keyPair: keyPair,
            peerPublicKey: peerPublicKey,
        };

        // Trigger a decryption in the case we have buffered up data.
        this._onData();
    }

    _on(event, fn)
    {
        const fns = this.eventHandlers[event] || [];
        this.eventHandlers[event] = fns;
        fns.push(fn);
    }

    _off(event, fn)
    {
        const fns = this.eventHandlers[event] || [];
        const index = fns.indexOf(fn);
        if (index > -1) {
            fns.splice(index, 1);
        }
    }

    _triggerEvent(event, data)
    {
        const fns = this.eventHandlers[event] || [];
        fns.forEach( fn => {
            fn(data);
        });
    }

    /**
     * Put a cap on how many bytes we are willing to buffer up
     *
     * @param {number} value
     *
     */
    setBufferSize(value)
    {
        this.maxBufferSize = value == null ? this.defaultMaxBufferSize : value;
    }
}

module.exports = MessageComm;
