/**
 * The Agent is responsible for:
 * -    setting up server sockets and instantiating client sockets.
 *      Upon connections handshake the connection, both cryptographically
 *      and also to match desired parameters for matching the two peers.
 *
 * -    Spawning a Protocol instance with the agreed upon configuration and a storage client.
 *
 * When a server or client socket connects it is wrapped inside a MessageComm which is corked.
 * The Handshake class is invoked either as Handshake.AsServer or Handshake.AsClient.
 *
 * A server socket upon connection does:
 * matchFn = (clientPubKey, serializedClientParams, clientInnerEncrypt) =>
 *  this.constructor.ServerMatchAccept(clientPubKey, serializedClientParams, server.accept, clientInnerEncrypt)
 *  All three arguments to matchFn comes from the client configurations sent over socket, where:
 *      clientPubKey = client.keyPair.publicKey,
 *      serializedClientParams = this.SerializeClientParams(client.params);
 *      clientInnerEncrypt = client.innerEncrypt
 *  These arguments are passed on to the ServerMatchAccept function together with the server.accept array,
 *  which will match the provided client parameters with all defined in the server.accept block
 *  and return the first match.
 *
 * match = Handshake.AsServer(messageComm, server.keyPair, matchFn);
 * [curatedServerParams, sharedParams, clientPubKey, innerEncrypt, encKeyPair, encPeerPublicKey] = match
 * If innerEncrypt==1 then the messageComm will be put into encrypted mode with the encKeyPair+encPeerPublicKey.
 * Inside ServerMatchAccept every server.accept block is iterated and matched for clientPubKey,
 * each match's params block is then matched as serverParams using MatchParams, as:
 *  [curatedServerParams, sharedParams] = MatchParams(serializedClientParams, serverParams, clientPubKey)
 * curatedServerParams is what the impl specific fn MatchParams returns extracted from the ServerParams (and possibly more).
 * sharedParams is what the impl spec fn MatchParams returns as negotiated parameters both for client and server. This has been sent to the client in the handshake.
 *
 * Finally the impl specific _serverConnected is called with
 *  (server.keyPair, clientPubKey, curatedServerParams, sharedParams, messageComm, name)
 * This impl specific function should instantiate a protocol with the given parameters, which will be
 * connected to its peer protocol via the messageComm.
 * 
 *
 * A client socket upon connection is simpler than its server counterpart, it has a direct intent
 * of connecting to a specific server (client.serverPubKey) using specific params (client.params)
 * which are passed to the server.
 *
 * serializedClientParams = this.SerializeClientParams(client.params);
 * match = Handshake.AsClient(messageComm, client.serverPubKey, client.keyPair, serializedClientParams, client.innerEncrypt)
 * [sharedParams, innerEncrypt, encKeyPair, encPeerPublicKey] = match
 * sharedParams is the negotiated params sent to us from server, which can be influenced by serializedClientParams.
 * innerEncrypt==1 if inner encryption was desired from either side.
 *  in such case encKeyPair and encPeerPublicKey are passed to the messageComm.
 *
 * Finally the impl specific _clientConnected fn is called with
 *  (client.keyPair, client.serverPubKey, client.params, sharedParams, messageComm, name)
 * This impl specific function should instantiate a protocol with the given parameters, which will be
 * connected to its peer protocol via the messageComm.
 *
 * If a client is configured to connect via a hub it might get instructed by the hub server
 * to act as the server in the peer to peer setup, it will then transform its client parameters
 * into a server params format using the impl specific fn ClientParamsIntoServer(client.params)
 * and it will handshake as a server does (described above).
 * It will however after a successful handshake still invoke the _clientConnected fn (not _serverConnected).
 *
 * The following functions have to be implemented in a derived class:
 * SerializeClientParams
 * ClientParamsIntoServer
 * MatchParams
 * GetType
 * _clientConnected
 * _serverConnected
 *
 */

/* Only include these three socket handlers when requested since they cannot be used within the browser */
let WSServer;
let TCPClient;
let TCPServer;

const WSClient = require("../pocket-sockets/WSClient");
const Handshake = require("./Handshake");
const MessageComm = require("./MessageComm");
const Hash = require("../util/hash");
const {HubClient} = require("./Hub");
const Logger = require("../logger/Logger");
const assert = require("assert");

/**
 * @typedef {Object} KeyPair
 * @property {string} secretKey - private key
 * @property {string} publicKey - public key
 */

class AbstractAgent
{
    /**
     * @constructor
     * @param {AgentConfigFormat} config:
     *  This is the basic structures of server/client configurations.
     *  A deriving class should add impl specific "params" to the configs (see below).
     *
     *  config = {
     *   servers: [
     *       {
     *          // pub, priv keys of the server, ed25519.
     *          // Must be lowercase.
     *          keyPair: {publicKey: "", secretKey: ""}
     *
     *          // Listener socket
     *          listen: {
     *              protocol: "tcp" | "websocket",
     *              host: "localhost",
     *              port: 8080,
     *              cert: // see AbstractServer for details
     *              key:  ^
     *          },
     *
     *          // Accept blocks for handshaking a newly connected client socket.
     *          // This base class verifies keys, the derived class will need to add
     *          // protocol specific parameters to match, if any.
     *          accept: [
     *              {
     *                  // Client public key received in handshake will be matched using
     *                  // this clientPubKey value.
     *                  // If a match is made then we proceed to matching client protocol
     *                  // preferences to the protocols defined below.
     *                  // Strings must be lowercase.
     *                  clientPubKey: <string | string[] | async Function(clientPubKey):boolean>,
     *
     *                  // Optional arbitrary name, used for onConnect events
     *                  name: <string | undefined>
     *
     *                  // Have the MessageComm perform encryption on data sent.
     *                  // This is useful when regular TLS is not available, or when TLS termination
     *                  // is done by a non-trusted part of the network.
     *                  // 0=don't require, 1=require message encryption,
     *                  // The reason this is a number and not a boolean is for possible added
     *                  // flexibility in the future with more options than on/off.
     *                  innerEncrypt: <number | null | undefined>,
     *
     *                  params: [
     *                      {
     *                          <impl specific details here.
     *                          these will be matched against the client params.>
     *                      },
     *                  ],
     *              },
     *          ]
     *      }
     *   ],
     *
     *   clients: [
     *       {
     *           // The client pub, priv keypair, ed25519.
     *           // Must be lowercase.
     *           keyPair: {publicKey: "", secretKey: ""}
     *
     *           // Optional arbitrary name, used for onConnect events
     *           name: <string | undefined>
     *
     *           // The ed25519 pub key of the server we are expecting to answer.
     *           // Must be lowercase.
     *           serverPubKey: <string>,
     *
     *           // Have the MessageComm perform encryption on data sent.
     *           // This is useful when regular TLS is not available, or when TLS termination
     *           // is done by a non-trusted part of the network, or when connecting via a non-trusted hub.
     *           // 0=don't require, 1=require message encryption,
     *           // The reason this is a number and not a boolean is for possible added
     *           // flexibility in the future with more options than on/off.
     *           innerEncrypt: <number | null | undefined>,
     *
     *           connect: {
     *               protocol: <string>,  // "tcp" or "websocket"
     *               reconnect: <boolean | null | undefined>,
     *
     *               // See AbstractClient connectOptions for details.
     *               host: <string | null>, RFC6066 states that this should not be an IP address, but a name when using TLS)
     *               port: <number>,
     *               secure: <boolean | null> (defualt false, set to true to make a secure connection)
     *               rejectUnauthorized: <boolean | null> (default true),
     *               cert: <Array | string | Buffer | null>, (client can identify with cert)
     *               key: <Array | string | Buffer | null>, (required if cert is set)
     *               ca: <Array | string | Buffer | null>, (set this to validate server self-signed certificate)
     *
     *               // If present then connect as via a hub.
     *               // <Object | null>
     *               hub: {
     *                   // Optional shared secret between peers for cloaked matching.
     *                   // When connecting via a hub the peers match via the hash of (protocolType, peerPubKey, sharedSecret).
     *                   // If a third party is aware of a peer public key and the protocol it is connecting with and which hub it is connecting via,
     *                   // it could interfere with the connection by posing as one of the peers which will result in peer's not finding each other as they should.
     *                   // An interferer could not connect as a peer, only interfere with peers successfully connecting to each other.
     *                   // The sharedSecret can be used to mitigate such annoyances.
     *                   sharedSecret: <string | null>,
     *
     *                   // Set to true to always handshake as server when connecting via a hub.
     *                   // This means that this side will after handshake get instantiated using _serverConnected.
     *                   // This also means that the agent will always connect a new socket
     *                   // to the hub when a socket is handshaked, so that there is always one
     *                   // socket waiting at the hub.
     *                   // When forceServer is set the "connect.reconnect" flag is ignored.
     *                   forceServer: <boolean | null>,
     *               }
     *           },
     *
     *           params: {
     *               <impl specific params here, these will be matched against
     *                the servers accept blocks>
     *           }
     *       }
     *   ]
     *  }
     */
    constructor(config)
    {
        this.isStopped = false;
        this.isStarted = false;

        /** @type {AgentConfigFormat} */
        if (!config) {
            throw "Invalid config";
        }

        this.config = config;

        const instanceId = Hash.generateRandomHex(4);
        const loggerId = `${(this).constructor.name}:${instanceId}`;
        this.logger = Logger(loggerId, ( (process ? process.env : window) || {} ).LOG_LEVEL );

        let includeTCPServer    = false;
        let includeWSServer     = false;
        let includeTCPClient    = false;

        // Validate configs
        this.config.servers = (this.config.servers || []).filter( server => {
            try {
                if (typeof server.keyPair !== "object") {
                    throw "keyPair object must be provided.";
                }
                if (typeof server.keyPair.publicKey !== "string" || server.keyPair.publicKey.length !== 64 || !server.keyPair.publicKey.match(/^[a-z0-9]+$/)) {
                    throw "server.keyPair.publicKey must be lowercase string ([a-z0-9] 64 bytes.";
                }
                if (typeof server.keyPair.secretKey !== "string" || server.keyPair.secretKey.length !== 128 || !server.keyPair.secretKey.match(/^[a-z0-9]+$/)) {
                    throw "server.keyPair.secretKey must be lowercase string ([a-z0-9] 128 bytes.";
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
                    const keys = [];
                    if (typeof accept.clientPubKey === "string") {
                        keys.push(accept.clientPubKey);
                    }
                    else if (Array.isArray(accept.clientPubKey)) {
                        keys.push(...accept.clientPubKey);
                    }
                    keys.forEach( key => {
                        if (key.length !== 64 || !key.match(/^[a-z0-9]+$/)) {
                            throw "accept.clientPubKey must be lowercase ([a-z0-9] 64 bytes.";
                        }
                    });

                    if (accept.innerEncrypt != null && accept.innerEncrypt !== 0 && accept.innerEncrypt !== 1) {
                        throw "accept.innerEncrypt must be number 0 or 1 when set.";
                    }
                });
                // Note: server.listen will be validated by the server socket class.
                // server.accept.params will be validated by the impl deriving this class.
            }
            catch(e) {
                const err = typeof e === "object" ? e.stack || e.message || e : e;
                this.logger.error("Server config invalid, ignoring it:", err);
                return false;
            }

            return true;
        });
        this.config.clients = (this.config.clients || []).filter( client => {
            try {
                if (typeof client.keyPair !== "object") {
                    throw "keyPair object must be provided.";
                }
                if (typeof client.keyPair.publicKey !== "string" || client.keyPair.publicKey.length !== 64 || !client.keyPair.publicKey.match(/^[a-z0-9]+$/)) {
                    throw "client.keyPair.publicKey must be lowercase string ([a-z0-9] 64 bytes.";
                }
                if (typeof client.keyPair.secretKey !== "string" || client.keyPair.secretKey.length !== 128 || !client.keyPair.secretKey.match(/^[a-z0-9]+$/)) {
                    throw "client.keyPair.secretKey must be lowercase string ([a-z0-9] 128 bytes.";
                }
                if (!client.serverPubKey || typeof client.serverPubKey !== "string") {
                    throw "serverPubKey must be provided (64 byte lowercase string [a-z0-9])";
                }
                if (client.serverPubKey.length !== 64 || !client.serverPubKey.match(/^[a-z0-9]+$/)) {
                    throw "client.serverPubKey must be lowercase ([a-z0-9] 64 bytes.";
                }
                if (client.innerEncrypt != null && client.innerEncrypt !== 0 && client.innerEncrypt !== 1) {
                    throw "innerEncrypt must be number 0 or 1 when if set.";
                }
                if (typeof client.connect !== "object") {
                    throw "connect object must be provided.";
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
                    throw "connect.reconnect must be boolean when set.";
                }
                if (client.connect.hub && typeof client.connect.hub !== "object") {
                    throw "connect.hub must be an object when set.";
                }
                // Note: connect.{host,port} will be checked by the socket client instance.
                // client.params will be validated by the impl deriving this class.
                if (!client.params || typeof client.params !== "object") {
                    throw "client.params must be an object.";
                }
            }
            catch(e) {
                const err = typeof e === "object" ? e.stack || e.message || e : e;
                this.logger.error("Client config invalid, ignoring it:", err);
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
        if (this.isStarted) {
            return;
        }
        this.isStarted = true;

        if (this.config.servers) {
            this._setupServerListeners();
        }
        if (this.config.clients) {
            this._attemptClientConnections();
        }
    }

    stop()
    {
        if (this.isStopped) {
            return;
        }

        this.isStopped = true;

        // Close all server sockets and in the process also their accepted client sockets.
        this.serverSockets.forEach( socket => {
            if (socket) {
                socket.close();
            }
            else {
                this.logger.error("Attempted to close invalid server socket.");
            }
        });

        // Close all client sockets.
        this.clientSockets.forEach( socket => {
            if (socket) {
                socket.disconnect();
            }
            else {
                this.logger.error("Attempted to close invalid client socket.");
            }
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
        throw "SerializeClientParams not implemented.";
    }

    /**
     * For peer to peer connections via a hub, one of the clients
     * need to transform into a server for the handshake to proceed.
     *
     * This function transforms a client params object to a server accept params object.
     *
     * @param {Object} client params object
     * @return {Object} server params object
     */
    static ClientParamsIntoServer(clientParams)
    {
        throw "ClientParamsIntoServer not implemented.";
    }

    /**
     * Match the client parameters extracted with SerializeClientParams
     * with the server's accept block protocols parameters.
     *
     * @param {Object} serializedClientParams as given by SerializeClientParams()
     * @param {Object} serverParams accept block params object
     * @param {string} clientPubKey verified in handshake already
     * @return {Array<Object, String>}
     *  0: curatedServerParams which matches serializedClientParams, where rootNodeId can
     *     be different that what the server had set, depending on the logic.
     *  1: sharedParams
     */
    static async MatchParams(serializedClientParams, serverParams, clientPubKey)
    {
        throw "MatchParams not implemented.";
    }

    /**
     * Returns the client protocol type.
     * This is impl specific.
     * @param {Object} client config object
     * @return {string} 
     */
    static GetType(client)
    {
        throw "GetType not implemented.";
    }

    /**
     *
     * @param {KeyPair} local keypair
     * @param {string} remotePubKey
     * @param {Object} client.params object
     * @param {string} sharedParams received from Server. What this is is impl specific, but it
     *  contains something the Client should know about.
     * @param {MessageComm} messageComm
     * @param {string} name of client block
     *
     */
    async _clientConnected(localKeyPair, remotePubKey, clientParams, sharedParams, messageComm, name)
    {
        throw "_clientConnected not implemented.";
    }

    /**
     *
     * @param {KeyPair} local keypair
     * @param {string} remotePubKey
     * @param {Object} curatedServerParams curated server.accept.params object
     * @param {string} sharedParams created by Server and passed to Client. Put here for reference.
     * @param {MessageComm} messageComm
     * @param {string} name in accept block
     *
     */
    async _serverConnected(localKeyPair, remotePubKey, curatedServerParams, sharedParams, messageComm, name)
    {
        throw "_serverConnected not implemented.";
    }

    /**
     * Event when client or server is successfully connected.
     * Signature of callback fn is impl specific since it is invoked from _clientConnected or _serverConnected.
     * @param {Function} fn
     * @param {string | undefined} name optinal name to filter for, default is all ("*").
     */
    onConnect(fn, name)
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
     * @param {string} [name]
     */
    onError(fn, name)
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
     * @param {Array} acceptBlocks server accept blocks array to find match for clientPubKey and parametersJSON.
     * @param {Number} clientInnerEncrypt 0 for no client preference for inner encryption, 1 for required inner encryption.
     * @return {Array<curatedServerParams <Object>, sharedParams <string | null>, innerEncryption <Number>, name {string | null}}
     *  curatedServerParams is the matched params object from the server accept object (curated rootNodeId).
     *  sharedParams is whatever the server needs to send the client in the final stage of the handshake.
     *  innerEncryption is the decided upon value for client and server. 1 means use inner encryption.
     */
    static async ServerMatchAccept(clientPubKey, serializedClientParams, acceptBlocks, clientInnerEncrypt)
    {
        // Create new local-scoped logger object
        const instanceId = Hash.generateRandomHex(4);
        const loggerId = `${(this).constructor.name}:${instanceId}`;
        const logger = Logger(loggerId, ( (process ? process.env : window) || {} ).LOG_LEVEL );

        let curatedServerParams = null;
        let sharedParams        = null;
        let name                = null;

        let innerEncryption = clientInnerEncrypt;

        try {
            if (typeof clientPubKey !== "string" || clientPubKey.length !== 64 || !clientPubKey.match(/^[a-z0-9]+$/)) {
                throw "clientPubKey must be lowercase string ([a-z0-9] 64 bytes.";
            }

            for (let index=0; index<acceptBlocks.length; index++) {
                /** @type {*} */
                const accept = acceptBlocks[index];
                let result = false;
                /** @property {(string | Array<string> | Function)} clientPubKey */
                const acceptClientPubKey = accept.clientPubKey;
                if (typeof(acceptClientPubKey) === "string") {
                    if (acceptClientPubKey === clientPubKey) {
                        result = true;
                    }
                }
                else if (Array.isArray(acceptClientPubKey)) {
                    if (acceptClientPubKey.some( pubKey => pubKey === clientPubKey )) {
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
                if (accept.params) {
                    for (let index2=0; index2<accept.params.length; index2++) {
                        const serverParams = accept.params[index2];
                        [curatedServerParams, sharedParams] = await this.MatchParams(serializedClientParams, serverParams, clientPubKey);
                        if (curatedServerParams) {
                            if (accept.innerEncrypt != null) {
                                innerEncryption = Math.max(innerEncryption, accept.innerEncrypt);
                            }
                            name = accept.name;
                            break;
                        }
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
            const err = typeof e === "object" ? e.stack || e.message || e : e;
            logger.error("Could not match parameters in Agent. Reason: ", err);
            return null;
        }

        return [curatedServerParams, sharedParams, innerEncryption, name];
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
                this.logger.error("Invalid server config, ignoring one listener.");
                return;
            }

            this.logger.info(`Listening on ${server.listen.protocol}://${server.listen.host || "localhost"}:${server.listen.port}. Secure: ${server.listen.cert != null}`);

            this.serverSockets.push(serverSocket);

            serverSocket.onConnection( async (serverClientSocket) => {
                this.logger.info(`Peer connected on port ${server.listen.port}.`);
                assert(serverClientSocket, "Expecting a valid server client socket as input to MessageComm");
                const messageComm = new MessageComm(serverClientSocket);
                // Limit the size of transfer before disconnect to reduce DOS attack vector.
                messageComm.setBufferSize(2048);
                messageComm.cork();

                const result = await Handshake.AsServer(messageComm, server.keyPair,
                    (clientPubKey, serializedClientParams, clientInnerEncrypt) => this.constructor.ServerMatchAccept(clientPubKey, serializedClientParams, server.accept, clientInnerEncrypt));

                if (result) {
                    const [curatedServerParams, sharedParams, clientPubKey, innerEncrypt, encKeyPair, encPeerPublicKey, name] = result;
                    if (innerEncrypt > 0) {
                        messageComm.setEncrypt(encKeyPair, encPeerPublicKey);
                        this.logger.info("MessageComm encrypted.");
                    }

                    messageComm.setBufferSize();  // Set back to default limit.

                    this._serverConnected(server.keyPair,
                        clientPubKey, curatedServerParams, sharedParams, messageComm, name);
                }
                else {
                    this.logger.error("Could not handshake accepted socket, disconnecting.");
                    serverClientSocket.disconnect();
                }
            });

            try {
                serverSocket.listen();
            }
            catch(e) {
                const err = typeof e === "object" ? e.stack || e.message || e : e;
                this.logger.error("Error when initiating listener for server: ", err);
                return;
            }
        });
    }

    _attemptClientConnections()
    {
        // Copy array
        const attemptConnections = this.config.clients.slice();

        // Check each second for connections to attempt
        let intervalId;
        intervalId = setInterval( () => {
            if (this.isStopped) {
                clearInterval(intervalId);
                return;
            }

            while (attemptConnections.length > 0) {
                const client = attemptConnections.pop();

                /** @type {AbstractClient} */
                let clientSocket;

                if (client.connect.protocol.toLowerCase() === "tcp") {
                    clientSocket = new TCPClient(client.connect);
                }
                else if (client.connect.protocol.toLowerCase() === "websocket") {
                    clientSocket = new WSClient(client.connect);
                }
                else {
                    this.logger.error("Invalid server config.");
                    return;
                }

                this.logger.info(`Connecting to ${client.connect.protocol}://${client.connect.host || "localhost"}:${client.connect.port}`);

                if (client.connect.hub && Boolean(client.connect.hub.forceServer)) {
                    // Mark this socket as the free hub server socket.
                    // This is important to know if it closes, then we need to recreate it.
                    clientSocket.userData.isFreeHubSocket = true;
                }

                this.clientSockets.push(clientSocket);

                clientSocket.onError( (err) => { // jshint ignore:line
                    const index = this.clientSockets.indexOf(clientSocket);
                    if (index > -1) {
                        this.clientSockets.splice(index, 1);
                    }
                    this._connectFailure(client.name, "No route to host.");
                });

                clientSocket.onDisconnect( () => {
                    const index = this.clientSockets.indexOf(clientSocket);
                    if (index > -1) {
                        this.clientSockets.splice(index, 1);
                    }
                    let reconnect = false;
                    if (client.connect.hub && Boolean(client.connect.hub.forceServer)) {
                        // If we are connecting to hub as a server, we always need
                        // to keep one free socket available at the hub.
                        // We need to detect here if the clsed socket was the free socket,
                        // in such case we must reconnect it.
                        if (clientSocket.userData.isFreeHubSocket) {
                            reconnect = true;
                        }
                    }
                    else if (client.connect.reconnect) {
                        reconnect = true;
                    }

                    if (reconnect) {
                        // Put client back in connect loop, but wait a few seconds...
                        setTimeout( () => attemptConnections.push(client), 5000);
                    }
                });

                clientSocket.onConnect(async () => { // jshint ignore:line
                    try {
                        const messageComm = new MessageComm(clientSocket);
                        // Limit the size of transfer before disconnect to reduce DOS attack vector.
                        messageComm.setBufferSize(2048);

                        // Check if to connect to hub.
                        // If connecting to hub then we have a peer to peer connection between to clients,
                        // in such a case one of the client will need to take the role of server when handshaking.
                        let handshakeAsClient;
                        let handshakeSuccessful = false;
                        let sharedParams, innerEncrypt, encKeyPair, encPeerPublicKey;
                        let forceServer;
                        if (client.connect.hub) {
                            const want  = Hash.hash2([this.constructor.GetType(client), client.serverPubKey, client.connect.hub.sharedSecret || ""], "hex");
                            const offer = Hash.hash2([this.constructor.GetType(client), client.keyPair.publicKey, client.connect.hub.sharedSecret || ""], "hex");
                            forceServer = Boolean(client.connect.hub.forceServer);
                            const isServer = await HubClient(want, [offer], messageComm, forceServer);

                            if (isServer == null) {
                                throw "Hub error";
                            }

                            if (forceServer) {
                                // This is no longer the free hub socket.
                                clientSocket.userData.isFreeHubSocket = false;
                                // Spin off another connection to the hub
                                attemptConnections.push(client);
                            }

                            if (isServer) {
                                // It fell upon this client to act as a server when connecting peer to peer.
                                // Gotta transform the client params to server params
                                handshakeAsClient = false;
                                const server = {
                                    keyPair: client.keyPair,
                                    accept: [
                                        {
                                            clientPubKey:   client.serverPubKey,
                                            name:           client.name,
                                            innerEncrypt:   client.innerEncrypt,
                                            params: [
                                                this.constructor.ClientParamsIntoServer(client.params)
                                            ]
                                        }
                                    ],
                                };

                                messageComm.cork();
                                const result = await Handshake.AsServer(messageComm, server.keyPair,
                                    (clientPubKey, serializedClientParams, clientInnerEncrypt) => this.constructor.ServerMatchAccept(clientPubKey, serializedClientParams, server.accept, clientInnerEncrypt));

                                if (result) {
                                    // Unused
                                    let _;
                                    [_, sharedParams, _, innerEncrypt, encKeyPair, encPeerPublicKey] = result;
                                    handshakeSuccessful = true;
                                    this.logger.debug("Handshaked successfully");
                                }
                            }
                            else {
                                handshakeAsClient = true;
                            }
                        }
                        else {
                            handshakeAsClient = true;
                        }

                        let innerEncryption = 0;
                        if (handshakeAsClient) {
                            // Perform client handshake.
                            innerEncryption     = client.innerEncrypt ? client.innerEncrypt : 0;
                            const parameters    = this.constructor.SerializeClientParams(client.params);
                            messageComm.cork();
                            const result        = await Handshake.AsClient(messageComm, client.serverPubKey, client.keyPair, parameters, innerEncryption);
                            if (result) {
                                [sharedParams, innerEncrypt, encKeyPair, encPeerPublicKey] = result;
                                handshakeSuccessful = true;
                            }
                        }

                        if (handshakeSuccessful) {
                            messageComm.setBufferSize();  // Set back to default limit.
                            if (innerEncrypt > 0 || innerEncryption > 0) {
                                messageComm.setEncrypt(encKeyPair, encPeerPublicKey);
                                this.logger.info("MessageComm encrypted.");
                            }

                            if (forceServer) {
                                this._serverConnected(client.keyPair,
                                    client.serverPubKey, client.params, sharedParams, messageComm, client.name);
                            }
                            else {
                                this._clientConnected(client.keyPair,
                                    client.serverPubKey, client.params, sharedParams, messageComm, client.name);
                            }
                        }
                        else {
                            throw "Could not handshake";
                        }
                    }
                    catch (e) {
                        const err = typeof e === "object" ? e.stack || e.message || e : e;
                        this.logger.error("Could not handshake", err);
                        clientSocket.disconnect();
                        this._connectFailure(client.name, err);
                    }
                });

                clientSocket.connect();
            }
        }, 1000);
    }

    /**
     * Must be called from _clientConnected and _serverConnected
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
        a.forEach( fn => fn(name, ...args) );
    }

    /**
     * Called when an outgoing connection cannot connect.
     * @param {string} name of the connection, for the users event hook to fire.
     * @param {string} msg
     */
    _connectFailure(name, msg)
    {
        const err = {
            origin: "Agent",
            errorType: "connection",
            msg: msg,
            name: name
        };
        const a = Array.prototype.concat(this.onConnectFailureEvents[name] || [], this.onConnectFailureEvents["*"] || []);
        a.forEach( fn => fn(err) );
    }
}

module.exports = AbstractAgent;
