/**
 * An Agent is responsible for initiating connections to peers and for listening
 * on connections from peers.
 *
 * The Agent will handshake the connections and call for spawning of protocol instances,
 * but which functions must be implemented in the derived class.
 *
 */

//
// Only include these tree on request since they cannot be used within the browser.
let WSServer;
let TCPClient;
let TCPServer;
const WSClient = require("../pocket-sockets/WSClient");
const Handshake = require("../pocket-messaging/Handshake");
const MessageComm = require("../pocket-messaging/MessageComm");

/**
 * @typedef {Object} KeyPair
 * @property {string} priv - private key
 * @property {string} pub - public key
 */

/**
 * @typedef {Object} ServerListenType
 * @property {string} adapter
 * @property {string} port
 */

/**
 * @typedef {Object} ServerAcceptProtocolsType
 * @property {(string | Array<string> | Function)} clientPubKey
 * @property {Array<ServerAcceptType>} protocols
 */

/**
 * @typedef {Object} ServerAcceptProtocolsConfigSyncPreferencesType
 * @property {number} blobFromTime - UNIX time to earliest got blobs from,
 * @property {number} blobMinIndex - blob index must be equal or greater than this,
 * @property {number} blobMaxIndex - blob index must be equal or lesser than this
 * @property {number} blobMinSubIndex - blob sub index must be equal or greater than this,
 * @property {number} blobMaxSubIndex - blob sub index must be equal or lesser than this,
 * @property {number} blobMaxSize - Maximum individual size of a blob
 * @property {number} blobMaxSizePerNode - larget size in bytes summed for all blobs below the same node,
 * @property {number} blobsMaxTotalSize - total blob size maximum
 */

/**
 * @typedef {Object} ServerAcceptProtocolsConfigType
 * @property {boolean} disableRemoteSync
 * @property {boolean} initialSync
 * @property {string} subscribe
 * @property {number} subscribeDepth
 * @property {ServerAcceptProtocolsConfigSyncPreferencesType} syncPreferences
 * @property {boolean} [reSync] - optional user-defined setting to automatically perform a new sync request when receipts are falling out of time
 */

/**
 * @typedef {Object} ServerAcceptType
 * @property {string} name
 * @property {typeof import('./Protocol')} class
 * @property {ServerAcceptProtocolsConfigType} protocolConfig
 * @property {import('./StorageFactory')} storageFactory
 * @property {string} rootNodeId
 * @property {number} handshakeDepth
 */

/**
 * @typedef {Object} ServerConfigType
 * @property {KeyPair} keyPair
 * @property {ServerListenType} listen
 * @property {Array<ServerAcceptProtocolsType>} accept
 */

/**
 * @typedef {Object} ClientConfigProtocolType
 * @property {string} name
 * @property {import('./Protocol')} class
 * @property {ServerAcceptProtocolsConfigType} config
 * @property {import('./StorageFactory')} storageFactory
 * @property {string} rootNodeId
 * @property {boolean} reconnect
 */

/**
 * @typedef {Object} ClientConfigType
 * @property {KeyPair} keyPair
 * @property {string} serverPubKey
 * @property {string} endpoint
 * @property {ClientConfigProtocolType} protocol
 */

/**
 * @typedef {Object} AgentConfigFormat
 * @property {Array<ServerConfigType>} [servers]
 * @property {Array<ClientConfigType>} [clients]
 */

class AbstractAgent
{
    /**
     * @constructor
     * @param {AgentConfigFormat} config
     */
    constructor(config)
    {
        this.isStopped = false;

        /** @type {AgentConfigFormat} */
        if (!config) {
            throw "Invalid config";
        }

        /**
         * This is the basic structures of server/client configurations.
         * A deriving class should add impl specific "params" to the configs (see below).
         *
         * config = {
         *  servers: [
         *      // pub, priv keys of the server, ed25519.
         *      keyPair: {},
         *
         *      // Listener socket
         *      listen: {
         *         protocol: "tcp" | "websocket",
         *         host: "localhost",
         *         port: 8080,
         *         cert: // see AbstractServer for details
         *         key:  ^
         *      },
         *
         *      // Accept blocks for handshaking a newly connected client socket.
         *      // This base class verifies keys, the derived class will need to add
         *      // protocol specific parameters to match, if any.
         *      accept: [
         *          {
         *              // Client public key received in handshake will be matched using
         *              // this clientPubKey value.
         *              // If a match is made then we proceed to matching client protocol
         *              // preferences to the protocols defined below.
         *              clientPubKey: <string | string[] | async Function(clientPubKey):boolean>,
         *
         *              // Optional arbitrary name, used for onConnected events
         *              name: <string | undefined>
         *
         *              // Have the MessageComm perform encryption on data sent.
         *              // This is useful when regular TLS is not available, or when TLS termination
         *              // is done by a non-trusted part of the network.
         *              // 0=don't require, 1=require message encryption,
         *              // The reason is is a number and not a boolean is for possible added
         *              // flexibility in the future with more options than on/off.
         *              innerEncrypt: <number | null | undefined>,
         *
         *              params: [
         *                  {
         *                      <impl specific details here.
         *                       these will be matched against the client params.>
         *                  },
         *              ],
         *          },
         *      ]
         *  ],
         *
         *  clients: [
         *      {
         *          // The client pub, priv keypair, ed25519.
         *          keyPair: {}
         *
         *          // Optional arbitrary name, used for onConnected events
         *          name: <string | undefined>
         *
         *          // The ed25519 pub key of the server we are expecting to answer.
         *          serverPubKey: "",
         *
         *          // Have the MessageComm perform encryption on data sent.
         *          // This is useful when regular TLS is not available, or when TLS termination
         *          // is done by a non-trusted part of the network, or when connecting via a non-trusted hub.
         *          // 0=don't require, 1=require message encryption,
         *          // The reason is is a number and not a boolean is for possible added
         *          // flexibility in the future with more options than on/off.
         *          innerEncrypt: <number | null | undefined>,
         *
         *          connect: {
         *              // See AbstractClient for details.
         *              protocol: "tcp" | "websocket",
         *              host: "localhost",
         *              port: 8080,
         *              reconnect: <boolean | null | undefined>
         *          },
         *
         *          params: {
         *              <impl specific params here, these will be matched against
         *               the servers accept blocks>
         *          }
         *      }
         *  ]
         */
        this.config = config;

        let includeTCPServer    = false;
        let includeWSServer     = false;
        let includeTCPClient    = false;

        // Validate configs
        this.config.servers = (this.config.servers || []).filter( server => {
            try {
                if (typeof server.keyPair !== "object") {
                    throw "keyPair must be provided.";
                }
                if (typeof server.listen !== "object") {
                    throw "listen object must be provided.";
                }
                if (!server.listen.protocol) {
                    throw "listen.protocol must be provided.";
                }
                if (server.listen.protocol.toLowerCase() === "tcp") {
                    includeTCPServer = true;
                    // Pass
                }
                else if (server.listen.protocol.toLowerCase() === "websocket") {
                    includeWSServer = true;
                    // Pass
                }
                else {
                    throw `Unknown transport protocol: ${server.listen.protocol}`;
                }
                if (!Array.isArray(server.accept)) {
                    throw "accept array must be provided.";
                }
                server.accept.forEach( accept => {
                    if (typeof accept !== "object") {
                        throw "accept blocks must be objects.";
                    }
                    if (typeof accept.clientPubKey !== "string"
                        && typeof accept.clientPubKey !== "function"
                        && !Array.isArray(accept.clientPubKey)) {
                        throw "accept.clientPubKey must be string, string[] or function.";
                    }
                    if (accept.innerEncrypt != null && accept.innerEncrypt != 0 && accept.innerEncrypt != 1) {
                        throw "accept.innerEncrypt must be number 0 or 1, if set.";
                    }
                });
                // Note: server.listen will be validated by the server socket class.
                // server.accept.params will be validated by the impl deriving this class.
            }
            catch(e) {
                console.error("Server config invalid, ignoring it:", e);
                return false;
            }

            return true;
        });
        this.config.clients = (this.config.clients || []).filter( client => {
            try {
                if (typeof client.keyPair !== "object") {
                    throw "keyPair must be provided.";
                }
                if (!client.serverPubKey) {
                    throw "serverPubKey must be provided.";
                }
                if (client.innerEncrypt != null && client.innerEncrypt != 0 && client.innerEncrypt != 1) {
                    throw "innerEncrypt must be number 0 or 1, if set.";
                }
                if (typeof client.connect !== "object") {
                    throw "connect must be provided.";
                }
                if (!client.connect.protocol) {
                    throw "connect.protocol must be provided.";
                }
                if (client.connect.protocol.toLowerCase() === "tcp") {
                    includeTCPClient = true;
                    // Pass
                }
                else if (client.connect.protocol.toLowerCase() === "websocket") {
                    // Pass
                }
                else {
                    throw `Unknown transport protocol: ${client.connect.protocol}`;
                }
                if (client.connect.reconnect != null && typeof client.connect.reconnect !== "boolean") {
                    throw "connect.reconnect must be boolean if set.";
                }
                // Note: connect.{host,port} will be checked by the socket client instance.
                // client.params will be validated by the impl deriving this class.
            }
            catch(e) {
                console.error("Client config invalid, ignoring it:", e);
                return false;
            }

            return true;
        });

        if (includeTCPServer) {
            TCPServer = require("../pocket-sockets/TCPServer");
        }

        if (includeTCPClient) {
            TCPClient = require("../pocket-sockets/TCPClient");
        }

        if (includeWSServer) {
            WSServer = require("../pocket-sockets/WSServer");
        }

        /** @type {Array<TCPServer | WSServer>} */
        this.serverSockets = [];
        /** @type {Array<TCPClient | WSClient>} */
        this.clientSockets = [];

        /** @type {Object<string, Array<Function>>} */
        this.onConnectedEvents = {};
        this.onConnectFailureEvents = {};
    }

    // Start the never ending process of connecting and maintaining connections on the Client's behalf.
    start()
    {
        if (this.config.servers) {
            this._setupServerListeners();
        }
        if (this.config.clients) {
            this._attemptClientConnections();
        }
    }

    stop()
    {
        this.isStopped = true;

        // Close all server sockets and in the process also their accepted client sockets.
        this.serverSockets.forEach( socket => {
            socket.close();
        });

        // Close all client sockets.
        this.clientSockets.forEach( socket => {
            socket.disconnect();
        });
    }

    /**
     * It will serialize the client parameters so it can be sent over socket.
     * The server side knows how to deserialize it.
     *
     * @param {Object} client params object
     * @return {string} JSON
     */
    static SerializeClientParams(clientParams)
    {
        throw "Not implemented.";
    }

    /**
     * Match the client parameters extracted with SerializeClientParams
     * with the server's accept block protocols parameters.
     *
     * @param {Object} serializedClientParams as given by SerializeClientParams()
     * @param {Object} serverParams accept block params object
     * @param {string} clientPubKey verified in handshake already
     * @return {Array<Object, String>}
     *  0: curatedServerParams which matches serializedClientParams, where rootNodeId can *  be different that what the server had set, depending on the logic.
     *  1: sharedParams
     */
    static async MatchParams(serializedClientParams, serverParams, clientPubKey)
    {
        throw "Not implemented.";
    }

    /**
     *
     * @param {KeyPair} local keypair
     * @param {string} remotePubKey
     * @param {Object} client.params object
     * @param {string} sharedParams received from Server. What this is is impl specific, but it
     *  contains something the Client should know about.
     * @param {MessageComm} messageComm
     *
     */
    async _clientConnected(localKeyPair, remotePubKey, clientParams, sharedParams, messageComm)
    {
        throw "Not implemented.";
    }

    /**
     *
     * @param {KeyPair} local keypair
     * @param {string} remotePubKey
     * @param {Object} serverParams server.accept.params object
     * @param {string} sharedParams created by Server and passed to Client. Put here for reference.
     * @param {MessageComm} messageComm
     *
     */
    async _serverConnected(localKeyPair, remotePubKey, serverParams, sharedParams, messageComm)
    {
        throw "Not implemented.";
    }

    /**
     * Event when client or server is successfully connected.
     * Signature of callback fn is impl specific since it is invoked from _clientConnected or _serverConnected.
     * @param {Function} fn
     * @param {string | undefined} name optinal name to filter for, default is all ("*").
     */
    onConnected(fn, name)
    {
        name = name || "*";
        const a = this.onConnectedEvents[name] || [];
        this.onConnectedEvents[name] = a;
        a.push(fn);
    }

    /**
     * Event when client connection fails to connect.
     * Signature of callback fn is (msg, name).
     * @param {Function} fn
     * @param {string} name
     */
    onConnectFailure(fn, name)
    {
        name = name || "*";
        const a = this.onConnectFailureEvents[name] || [];
        this.onConnectFailureEvents[name] = a;
        a.push(fn);
    }

    /**
     * This function is passed to the Handshake.
     *
     * For a given client public key and the client parameters check the server object
     * for a matching block of settings.
     *
     * @static
     * @param {string} clientPubKey
     * @param {string | Buffer} serializedClientParams client parameters as given by SerializeClientParams().
     * @param {Array} server accept blocks array to find match for clientPubKey and parametersJSON.
     * @param {Number} clientInnerEncrypt 0 for no client preference for inner encryption, 1 for required inner encryption.
     * @return {Array<curatedServerParams <Object>, sharedParams <string | null>, innerEncryption <Number>}
     *  matched params object from the server accept object (curated rootNodeId),
     *  sharedParams is whatever the server needs to send the client in the final stage of the handshake.
     *
     *  innerEncryption is the decided upon value for client and server. 1 means use inner encryption.
     */
    static async ServerMatchAccept(clientPubKey, serializedClientParams, acceptBlocks, clientInnerEncrypt)
    {
        let curatedServerParams = null;
        let sharedParams        = null;

        let innerEncryption = clientInnerEncrypt;

        try {
            for (let index=0; index<acceptBlocks.length; index++) {
                /** @type {*} */
                const accept = acceptBlocks[index];
                let result = false;
                /** @property {(string | Array<string> | Function)} clientPubKey */
                const acceptClientPubKey = accept.clientPubKey;
                if (typeof(acceptClientPubKey) === "string") {
                    if (acceptClientPubKey.toLowerCase() === clientPubKey.toLowerCase()) {
                        result = true;
                    }
                }
                else if (Array.isArray(acceptClientPubKey)) {
                    if (acceptClientPubKey.some( pubKey => pubKey.toLowerCase() === clientPubKey.toLowerCase() )) {
                        result = true;
                    }
                }
                else if (typeof(acceptClientPubKey) === "function") {
                    const res = await acceptClientPubKey(clientPubKey);
                    if (res) {
                        result = true;
                    }
                }
                else {
                    throw "Accept client pub key must be string, array or function";
                }

                if (!result) {
                    // Match key in next accept block.
                    continue;
                }
                // Fall through to see if any of the params match.

                // Match implementation specific params in the server accept blocks.
                for (let index2=0; index2<accept.params.length; index2++) {
                    const serverParams = accept.params[index2];
                    [curatedServerParams, sharedParams] = await this.MatchParams(serializedClientParams, serverParams, clientPubKey);
                    if (curatedServerParams) {
                        if (accept.innerEncrypt != null) {
                            innerEncryption = Math.max(innerEncryption, accept.innerEncrypt);
                        }
                        break;
                    }
                }

                if (curatedServerParams) {
                    break;
                }

                // Continue loop and start over with matching client pub key to next accept block.
            }

            if (!curatedServerParams) {
                return null;
            }
        }
        catch(e) {
            console.error("Could not match parameters in Agent.");
            return null;
        }

        return [curatedServerParams, sharedParams, innerEncryption];
    }

    //
    // Private functions below
    //
    _setupServerListeners()
    {
        this.config.servers.forEach( server => {
            let serverSocket;
            if (server.listen.protocol.toLowerCase() === "tcp") {
                serverSocket = new TCPServer(server.listen);
            }
            else if (server.listen.protocol.toLowerCase() === "websocket") {
                serverSocket = new WSServer(server.listen);
            }
            else {
                console.error("Invalid server config, ignoring one listener.");
                return;
            }

            console.error(`Listening on ${server.listen.protocol}://${server.listen.host || "localhost"}:${server.listen.port}. Secure: ${server.listen.cert != null}`);

            this.serverSockets.push(serverSocket);

            serverSocket.onConnection( async (serverClientSocket) => {
                console.error("Peer connected on", server.listen.port);
                const messageComm = new MessageComm(serverClientSocket);
                // Limit the size of transfer before disconnect to reduce DOS attack vector.
                messageComm.setBufferSize(2048);
                messageComm.cork();

                const result = await Handshake.AsServer(messageComm, server.keyPair,
                    (clientPubKey, serializedClientParams, clientInnerEncrypt) => this.constructor.ServerMatchAccept(clientPubKey, serializedClientParams, server.accept, clientInnerEncrypt));

                if (result) {
                    const [curatedServerParams, sharedParams, clientPubKey, innerEncrypt, encKeyPair, encPeerPublicKey] = result;
                    if (innerEncrypt > 0) {
                        messageComm.setEncrypt(encKeyPair, encPeerPublicKey);
                        console.error("MessageComm encrypted.");
                    }

                    messageComm.setBufferSize();  // Set back to default limit.

                    this._serverConnected(server.keyPair,
                        clientPubKey, curatedServerParams, sharedParams, messageComm);
                }
                else {
                    console.error("Could not handshake accepted socket, disconnecting.");
                    serverClientSocket.disconnect();
                }
            });

            try {
                serverSocket.listen();
            }
            catch(e) {
                console.error("Error when initiating listener for server: ", e);
                return;
            }
        });
    }

    _attemptClientConnections()
    {
        const attemptConnections = Array.prototype.concat(this.config.clients);

        // Check each second for connections to attemp
        setInterval( () => {
            if (this.isStopped) {
                return;
            }

            while (attemptConnections.length > 0) {
                let client = attemptConnections.pop();

                /** @type {AbstractClient} */
                let clientSocket;

                if (client.connect.protocol.toLowerCase() === "tcp") {
                    clientSocket = new TCPClient(client.connect);
                }
                else if (client.connect.protocol.toLowerCase() === "websocket") {
                    clientSocket = new WSClient(client.connect);
                }
                else {
                    console.error("Invalid server config.");
                    return;
                }

                console.error(`Connecting to ${client.connect.protocol}://${client.connect.host || "localhost"}:${client.connect.port}`);

                this.clientSockets.push(clientSocket);

                clientSocket.onError( (err) => { // jshint ignore:line
                    this._connectFailure(client.name, "No route to host.");
                    if (client.connect.reconnect) {
                        // Put client back in connect loop, but hold back a few seconds...
                        setTimeout( () => attemptConnections.push(client), 5000);
                    }
                    return;
                });

                clientSocket.onConnect(async () => { // jshint ignore:line
                    const messageComm = new MessageComm(clientSocket);
                    messageComm.cork();
                    // Limit the size of transfer before disconnect to reduce DOS attack vector.
                    messageComm.setBufferSize(2048);
                    let innerEncryption = client.innerEncrypt ? client.innerEncrypt : 0;

                    const parameters = this.constructor.SerializeClientParams(client.params);

                    const result = await Handshake.AsClient(messageComm, client.serverPubKey, client.keyPair, parameters, innerEncryption);

                    if (result) {
                        const [sharedParams, innerEncrypt, keyPair, peerPublicKey] = result;
                        messageComm.setBufferSize();  // Set back to default limit.
                        if (innerEncrypt > 0 || innerEncryption > 0) {
                            messageComm.setEncrypt(keyPair, peerPublicKey);
                            console.error("MessageComm encrypted.");
                        }

                        this._clientConnected(client.keyPair,
                            client.serverPubKey, client.params, sharedParams, messageComm);

                        clientSocket.onDisconnect( () => {
                            if (client.connect.reconnect) {
                                // Put client back in connect loop, but wait a few seconds...
                                setTimeout( () => attemptConnections.push(client), 5000);
                            }
                        });
                    }
                    else {
                        this._connectFailure(client.name, "Could not handshake");
                        clientSocket.disconnect();
                        this.stop();
                        return;
                    }
                });
                clientSocket.connect();
            }
        }, 1000);
    }

    /**
     * Must be alled from _clientConnected and _serverConnected
     *
     * User can hook this event on "name".
     * Args are passed on as the implementation does it, the name is attached as last argument.
     *
     * @param {string} name of the connection, for the users event hook to fire.
     * @param {...args} passed on arguments.
     */
    _connected(name, ...args)
    {
        // Get all event handlers who matches this connection's name
        const a = Array.prototype.concat(this.onConnectedEvents[name] || [], this.onConnectedEvents["*"] || []);
        a.forEach( fn => fn(...args, name) );
    }

    /**
     * Called when an outgoing connection cannot connect.
     * @param {string} name of the connection, for the users event hook to fire.
     * @param {string} msg
     */
    _connectFailure(name, msg)
    {
        const a = Array.prototype.concat(this.onConnectFailureEvents[name] || [], this.onConnectFailureEvents["*"] || []);
        a.forEach( fn => fn(msg, name) );
    }
}

module.exports = AbstractAgent;
