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
         * config = {
         *  servers: [
         *      keyPair: {},
         *      listen: {
         *         protocol: "tcp" | "websocket",
         *         host: "localhost",
         *         port: 8080,
         *         cert: // see AbstractServer for details
         *         key:
         *      },
         *  // A server object is passed to the matching functions.
         *
         *  ],
         *  clients: [
         *      {
         *          serverPubKey: ""
         *          keyPair: {}
         *          connect: {
         *              // See AbstractClient for details.
         *              protocol: "tcp" | "websocket",
         *              host: "localhost",
         *              port: 8080,
         *              reconnect: <boolean>
         *          },
         *          protocol: {
         *              name: "",
         *              innerEncrypt: <boolean>,
         *              // Parameters put together by GetClientParameters() and passed to server matching function.
         *              parameter1:
         *              parameter2:
         *              parameter3:
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
                if (!Array.isArray(server.accept)) {
                    throw "accept must be provided.";
                }
                if (typeof server.listen !== "object") {
                    throw "listen must be provided.";
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
                // TODO: validate accept blocks
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
                if (typeof client.protocol !== "object") {
                    throw "protocol must be provided.";
                }
                // TODO: validate client.protocol
                // {
                //  class: Protocol,
                //  rootNodeId: <string>,
                //  innerEncrypt: <boolean | null>
                // }
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
     * Event when protocol is successfully connected
     * Signature of callback fn is (protocol, storageFactory).
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
                    (clientPubKey) => this.constructor.ServerAcceptKey(clientPubKey, server),
                    (clientPubKey, parameters, innerEncrypt) => this.constructor.ServerMatchAccept(clientPubKey, parameters, server, innerEncrypt));

                if (result) {
                    const [protocol, clientPubKey, innerEncrypt, encKeyPair, encPeerPublicKey] = result;
                    if (innerEncrypt > 0) {
                        messageComm.setEncrypt(encKeyPair, encPeerPublicKey);
                        console.error("MessageComm encrypted.");
                    }

                    messageComm.setBufferSize();  // Set back to default limit.

                    this._serverConnected(server.keyPair, clientPubKey, protocol, messageComm);
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
                    this._connectFailure("No route to host.", client.protocol.name);
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
                    let innerEncryption = client.protocol.innerEncrypt ? client.protocol.innerEncrypt : 0;
                    const useHub = false;
                    if (useHub) {
                        // If we are connecting through a hub we always encfore inner encryption of data
                        innerEncryption = 1;
                    }

                    const parameters = this.constructor.GetClientParameters(client);

                    const [innerEncrypt, keyPair, peerPublicKey] = await Handshake.AsClient(messageComm, client.serverPubKey, client.keyPair, parameters, innerEncryption);

                    if (innerEncrypt != null) {
                        messageComm.setBufferSize();  // Set back to default limit.
                        if (innerEncrypt > 0 || innerEncryption > 0) {
                            messageComm.setEncrypt(keyPair, peerPublicKey);
                            console.error("MessageComm encrypted.");
                        }

                        this._clientConnected(client.keyPair, client.serverPubKey, client.protocol, messageComm);
                        clientSocket.onDisconnect( () => {
                            if (client.connect.reconnect) {
                                // Put client back in connect loop, but wait a few seconds...
                                setTimeout( () => attemptConnections.push(client), 5000);
                            }
                        });
                    }
                    else {
                        this._connectFailure("Could not handshake", client.protocol.name);
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
     *
     * @param {KeyPair} local keypair
     * @param {string} remotePubKey
     * @param {Object} client protocol object
     * @param {MessageComm} messageComm
     *
     */
    async _clientConnected(localKeyPair, remotePubKey, protocol, messageComm)
    {
        try {
            const protocolClass     = protocol.class;
            const protocolConfig    = protocol.config;
            const storageFactory    = protocol.storageFactory;
            const rootNodeId        = protocol.rootNodeId;
            const name              = protocol.name;

            if (!protocolClass) {
                console.error("No protocol class given.");
                return;
            }

            const storageClient = storageFactory.connect();

            if (!storageClient) {
                console.error("Could not connect to storage");
                messageComm.disconnect();
                return;
            }

            const protocolInstance = new protocolClass(protocolConfig, messageComm, localKeyPair, remotePubKey, storageClient, rootNodeId, name);

            this._connected(protocolInstance, storageFactory);

            protocolInstance.start();
        }
        catch(e) {
            console.error("Could not spawn client protocol", e);
            if(messageComm) {
                messageComm.disconnect();
            }
        }
    }

    async _serverConnected(...args)
    {
        return this._clientConnected(...args);
    }

    _connected(protocolInstance, storageFactory)
    {
        // Get all event handlers who matches this protocol's name
        const name = protocolInstance.getName();
        const a = Array.prototype.concat(this.onConnectedEvents[name] || [], this.onConnectedEvents["*"] || []);
        a.forEach( fn => fn(protocolInstance, storageFactory) );
    }

    _connectFailure(msg, name)
    {
        const a = Array.prototype.concat(this.onConnectFailureEvents[name] || [], this.onConnectFailureEvents["*"] || []);
        a.forEach( fn => fn(msg, name) );
    }

    /**
     * This function is passed to the Handshake.
     *
     * For a given client public key, check the servers accept blocks for a match
     *
     * @static
     * @param {string} clientPubKey
     * @param {Object} server object to find match for clientPubKey.
     * @return {boolean} - true if any match, or false if no matches.
     */
    static async ServerAcceptKey(clientPubKey, server)
    {
        throw "Not implemented.";
    }

    /**
     * This function is passed to the Handshake.
     *
     * For a given client public key and the client parameters check the server object for a matching block of settings.
     *
     * @static
     * @param {string} clientPubKey
     * @param {string | Buffer} parametersJSON parameters in JSON serialized format as given by GetClientParameters().
     * @param {Object} server object to find match for clientPubKey and parametersJSON.
     * @param {Number} innerEncrypt 0 for no preference for inner enccryption, 1 for required inner encryption.
     * @return {Object} matched protocol object from the server object.
     */
    static async ServerMatchAccept(clientPubKey, parametersJSON, server, innerEncrypt)
    {
        throw "Not implemented.";
    }

    /**
     * This function is passed to Handshake.
     *
     * It will serialize the client parameters so it can be sent over socket.
     * The server side knows how to deserialize it.
     *
     * @param {Object} client
     * @return {string} parametersJSON
     */
    static GetClientParameters(client)
    {
        throw "Not implemented.";
    }
}

module.exports = AbstractAgent;
