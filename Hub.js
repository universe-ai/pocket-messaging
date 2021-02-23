const {WSServer} = require("@universe-ai/pocket-sockets");
const {TCPServer} = require("@universe-ai/pocket-sockets");
const MessageComm = require("./MessageComm");
const {MessageEncoder} = require("./Message");
const {Logger} = require("@universe-ai/util");

const loggerId = `Hub`;
const logger = Logger(loggerId, ( (process ? process.env : window) || {} ).LOG_LEVEL );

const registry = [];

/**
 * Spawn servers listening for client connections.
 * All servers are shared in the sense that clients connecting over TCP
 * can hook up with clients connecting over Websocket.
 *
 * @param {Object[]} server
 * @throws Error will be thrown when the server listen options are invalid.
 *
 */
function HubServer(servers)
{
    if (!servers) {
        logger.error("Invalid servers parameter:", servers);
        return;
    }

    servers.forEach( server => {
        if (!server.listen) {
            logger.error("Server config missing listen attribute, ignoring one listener.");
            return;
        }

        let serverSocket;
        if (server.listen.protocol.toLowerCase() === "tcp") {
            serverSocket = new TCPServer(server.listen);
        }
        else if (server.listen.protocol.toLowerCase() === "websocket") {
            serverSocket = new WSServer(server.listen);
        }
        else {
            logger.error("Invalid server config, ignoring one listener.");
            return;
        }


        logger.info(`Hub server listening on ${server.listen.protocol}://${server.listen.port}`);

        serverSocket.onConnection( async (serverClientSocket) => {
            logger.info(`Client connected on ${server.listen.protocol}://${server.listen.port}`);
            const messageComm = new MessageComm(serverClientSocket);

            logger.info(`Created new MessageComm with ID ${messageComm.getInstanceId()}`);

            const disconnected = () => {
                logger.info(`MessageComm with ID ${messageComm.getInstanceId()} disconnected prematurely`);
                unreg(messageComm);
            };

            messageComm.onDisconnect( disconnected );

            // Limit the size of transfer before disconnect to reduce DOS attack vector.
            messageComm.setBufferSize(2048);

            // Read incoming message to get want/offer.
            messageComm.setRouter( async (action, msgId, props) => {
                if (action === "match" ) {
                    const want          = props.want;
                    const offer         = props.offer;
                    const forceServer   = Boolean(props.forceServer);

                    const regged = reg(want, offer, forceServer, messageComm);

                    await waitForMatch(messageComm);

                    const peerMessageComm   = regged.peerMessageComm;
                    const isServer          = regged.isServer;

                    if (!peerMessageComm) {
                        // This happens when our messageComm has disconnected
                        unreg(messageComm);
                        messageComm.close();
                        return;
                    }
                    messageComm.offDisconnect( disconnected );
                    messageComm.onDisconnect( () => {
                        logger.info(`MessageComm with ID ${messageComm.getInstanceId()} disconnected`);
                        unreg(regged.messageComm);
                        peerMessageComm.close();
                    });

                    // Set back to default limit.
                    messageComm.setBufferSize();

                    // Cork it up so that incoming data after the sendMessage below is kept in buffer until
                    // the peer is ready to receive it.
                    messageComm.cork();

                    const message = new MessageEncoder(msgId);
                    message.addBoolean("isServer", isServer);
                    messageComm.sendMessage(message);

                    const peerRegged = getReg(peerMessageComm);
                    if (!peerRegged) {
                        logger.info(`MessageComm with ID ${messageComm.getInstanceId()} peer ${peerMessageComm.getInstanceId()} disconnected, aborting`);
                        unreg(regged.messageComm);
                        peerMessageComm.close();
                        return;
                    }

                    logger.info(`MessageComm with ID ${messageComm.getInstanceId()} is ready waiting for peer ${peerMessageComm.getInstanceId()}`);
                    // Say that we are ready
                    regged.ready.fn();

                    // Wait for peer to be ready
                    await peerRegged.ready.promise;

                    unreg(regged.messageComm);

                    logger.info(`MessageComm with ID ${messageComm.getInstanceId()} is now paired with peer ${peerMessageComm.getInstanceId()}`);
                    // Setting the messageComm to binary mode also uncorks it
                    // This will pass incoming data in binary form from this messagecomm to the peer's.
                    messageComm.setRouter(buffers => peerMessageComm.send(buffers), true);
                }
                else {
                    logger.error(`MessageComm with ID ${messageComm.getInstanceId()} received unknown message with action:`);
                    logger.error(action);
                    messageComm.close();
                }
            });
        });

        try {
            serverSocket.listen();
        }
        catch(e) {
            const err = typeof e === "object" ? e.stack || e.message || e : e;
            logger.error("Error when initiating listener for server: ", err);
        }
    });
}

/**
 * Remove any want/offer related to the messageComm.
 * @param {MessageComm} messageComm
 */
function unreg(messageComm)
{
    let index;
    for (index=0; index<registry.length; index++) {
        if (registry[index].messageComm === messageComm) {
            registry.splice(index, 1);
            logger.info(`Unreg messageComm ${messageComm.getInstanceId()}`);
            break;
        }
    }
}

/**
 * Push want/offer to registry
 * @param {string} want
 * @param {Array} offer
 * @param {boolean} forceServer
 * @param {MessageComm} messageComm
 * @return {object} reg object
 */
function reg(want, offer, forceServer, messageComm)
{
    const ready = {};
    ready.promise = new Promise( accept => {
        ready.fn = accept;
    });

    logger.info(`Reg messageComm ${messageComm.getInstanceId()}, forceServer: ${forceServer}`, want, offer);

    const regged = {want, offer, forceServer, messageComm, ready};

    registry.push(regged);

    return regged;
}

/**
 * Check message comm presence in registry
 * @param {MessageComm} messageComm
 * @returns {boolean} - flag indicating the state
 */
function isRegged(messageComm)
{
    return getReg(messageComm) ? true : false;
}

/**
 * Retrieve message comm from registry
 * @param {MessageComm} messageComm
 * @returns {Object | null} - registered entry or null when not available.
 */
function getReg(messageComm)
{
    let index;
    for (index=0; index<registry.length; index++) {
        const regged = registry[index];
        if (regged.messageComm === messageComm) {
            return regged;
        }
    }

    return null;
}

/**
 * Consume match
 * @param {MessageComm} messageComm
 * @return {boolean} true when match found or can never be found, false if to try again.
 */
function consumeMatch(messageComm)
{
    const regged = getReg(messageComm);

    if (!regged) {
        // Socket disconnected
        return true;
    }

    if (regged.peerMessageComm) {
        // Peer has already matched with us
        return true;
    }

    if (!regged.want) {
        // This side has no "want" (it's a server with offers only).
        // We need to wait for a peer to match against us.
        return false;
    }

    let index;
    for (index=0; index<registry.length; index++) {
        const regged2 = registry[index];

        if (regged2.peerMessageComm) {
            // Already matched
            continue;
        }

        if (regged2.messageComm === messageComm) {
            // Don't match against our selves
            continue;
        }

        // Check offers against preferred match of messageComm.
        if (regged2.offer.indexOf(regged.want) > -1) {
            // Now check if the reverse is also true.
            if (!regged2.want || regged.offer.indexOf(regged2.want) > -1) {
                regged.peerMessageComm  = regged2.messageComm;
                regged2.peerMessageComm = messageComm;

                // As default we put this messageComm as client because we know it has a "want".
                // It will only matter if one of the other side has multiple offers.
                // If forceServer is set then this part is set to server instead of client.
                const isServer      = regged.forceServer ? true : false;
                regged.isServer     = isServer;
                regged2.isServer    = !isServer;
                return true;
            }
        }
    }

    // No match found
    return false;
}

/**
 * Wait for a matching messageComm to register or return if our messageComm disconnects.
 *
 */
async function waitForMatch(messageComm)
{
    // Wait for peer or quit if our own socket disconnects.
    while(isRegged(messageComm)) {
        await sleep(333);
        if (consumeMatch(messageComm)) {
            break;
        }
    }
}

/**
 * Sleep helper function
 * @param {number} ms - time to sleep
 * @return {Promise}
 */

async function sleep(ms)
{
    return new Promise( resolve => {
        setTimeout( resolve, ms);
    });
}

/**
 * Communicate with a Hub Server as a Client.
 * Expose what you want to connect to and what you offer as connections.
 * When a match is made the Server responds and decides which client is to act as the server.
 *
 * @param {string} want
 * @param {string[]} offer
 * @param {MessageComm} messageComm
 * @param {Boolean} forceServer set to true to require that this client becomes server upon handshake
 * @return {Boolean | null} true if server, false if client, null on error.
 * @throws Error will be thrown when any of the arguments are missing or invalid.
 *
 */
async function HubClient(want, offer, messageComm, forceServer)
{
    // Send want and offer
    const message = new MessageEncoder("match");
    message.addString("want", want);
    message.addArray("offer", offer);
    message.addBoolean("forceServer", forceServer);

    if (!messageComm) {
        throw "Expecting MessageComm";
    }

    // Send message to Hub, without any timeout.
    const timeout  = 0;
    const asyncRet = await messageComm.sendMessage(message, true, timeout);

    // Await Instructions about being server or client.
    if (asyncRet.isSuccess()) {
        const props     = asyncRet.getProps();
        const isServer  = props.isServer;

        if (!isServer && forceServer) {
            throw "forceServer is set to true but the Hub designated us the client role, aborting.";
        }

        return isServer;
    }
    else {
        logger.debug("HubServer returned error:", asyncRet.errorMessage());
        return null;
    }
}

module.exports = {HubClient, HubServer};
