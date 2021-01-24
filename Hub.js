const WSServer = require("../pocket-sockets/WSServer");
const TCPServer = require("../pocket-sockets/TCPServer");
const MessageComm = require("./MessageComm");
const {MessageEncoder} = require("./Message");
const Logger = require("../logger/Logger");

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
    servers.forEach( server => {
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


        logger.info(`Hub server listening on ${server.listen.port}`);

        serverSocket.onConnection( async (serverClientSocket) => {
            logger.info("Client connected on", server.listen.port);
            const messageComm = new MessageComm(serverClientSocket);

            const disconnected = () => {
                unreg(messageComm);
            };

            messageComm.onDisconnect( disconnected );

            // Limit the size of transfer before disconnect to reduce DOS attack vector.
            messageComm.setBufferSize(2048);

            // Read incoming message to get want/offer.
            messageComm.setRouter( async (action, msgId, props) => {
                if (action === "match" ) {
                    const want = props.want;
                    const offer = props.offer;
                    const [peerMessageComm, isServer] = await waitForMatch(want, offer, messageComm);
                    if (!peerMessageComm) {
                        messageComm.close();
                        return;
                    }
                    messageComm.offDisconnect( disconnected );
                    messageComm.onDisconnect( () => {
                        peerMessageComm.close();
                    });

                    // Set back to default limit.
                    messageComm.setBufferSize();
                    // Tunnel any incoming traffic to the connected peer.
                    messageComm.setRouter(buffers => peerMessageComm.send(buffers), true);

                    const message = new MessageEncoder(msgId);
                    message.addBoolean("isServer", isServer);
                    messageComm.sendMessage(message);
                }
                else {
                    messageComm.close();
                }
            });
        });

        try {
            serverSocket.listen();
        }
        catch(e) {
            logger.error("Error when initiating listener for server: ", e);
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
            break;
        }
    }
}

/**
 * Push want/offer to registry
 * @param {string} want
 * @param {Array} offers
 * @param {MessageComm} messageComm
 */
function reg(want, offers, messageComm)
{
    registry.push( {want, offers, messageComm} );
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
        if (registry[index].messageComm === messageComm) {
            return registry[index];
        }
    }

    return null;
}

/**
 * Consume match
 * @param {MessageComm} messageComm
 * @return {Array<Object | boolean | null>}
 */
function consumeMatch(messageComm)
{
    const regged = getReg(messageComm);

    if (!regged) {
        return [null, null];
    }

    if (regged.peerMessageComm) {
        // Peer has already matched us
        unreg(regged.messageComm);
        return [regged.peerMessageComm, regged.isServer];
    }

    if (!regged.want) {
        // We need to wait for a peer to match against us, since we have no want.
        return [null, null];
    }

    let index;
    for (index=0; index<registry.length; index++) {
        const regged2 = registry[index];

        if (regged2.messageComm === messageComm) {
            // Don't match against our selves
            continue;
        }


        // Check offers against preferred match of messageComm.
        if (regged2.offers.indexOf(regged.want) > -1) {
            // Now check if the reverse is also true.
            if (!regged2.want || regged.offers.indexOf(regged2.want) > -1) {
                unreg(messageComm);
                regged2.peerMessageComm = messageComm;

                // We put this messageComm as client because we know it has a "want".
                // It will only matter if one of the other side has multiple offers.
                regged2.isServer = true;
                return [regged2.messageComm, false];
            }
        }
    }

    return [null, null];
}

/**
 * Wait for a matching messageComm to register.
 * When a match is found return the peer's messageComm instance.
 * If our socket disconnected then return null.
 *
 * @return {Array<Object | boolean | null>}
 */
async function waitForMatch(want, offer, messageComm)
{
    reg(want, offer, messageComm);

    let peerMessageComm = null;
    let isServer = null;
    // Wait for peer or quit when out own socket disconnects.
    while(!peerMessageComm && isRegged(messageComm)) {
        await sleep(333);
        [peerMessageComm, isServer] = consumeMatch(messageComm);
    }

    return [peerMessageComm, isServer];
}

/**
 * Sleepe helper function
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
 *
 */
async function HubClient(want, offer, messageComm)
{
    // Send want and offer
    const message = new MessageEncoder("match");
    message.addString("want", want);
    message.addArray("offer", offer);
    const asyncRet = await messageComm.sendMessage(message, true, 0);
    // Await Instructions of being server or client.
    if (asyncRet.isSuccess()) {
        const props = asyncRet.getProps();
        const isServer = props.isServer;
        return [isServer];
    }
    else {
        return null;
    }
}

module.exports = {HubClient, HubServer};
