/**
 * A handshake is performed between a Client and Server with the intention of:
 * 1. Prove each sides identity.
 * 2. Decide if there is a match of the client preference with the server's availability of
 *    supported protocols and settings.
 *    A client has a strict idea what how it wants to connect, in terms of which
 *    Universe Protocol to use and what rootnode ID to have as common.
 *    A server can support a number of options and this handshake process will find the first matching one.
 *
 * This handshake has a focus on privacy hence the six step handshake.
 *
 * WARNING: THIS CODE IS NOT PROPERLY VETTED YET.
 *          ONLY VALUES ARE ENCRYPTED, LEAVING OTHER MESSAGE DATA SUCH AS KEY NAMES UNENCRYPTED, WHICH COULD BE EXPLOITABLE,
 *          SO WE NEED TO UP THE GAME ON THAT PART.
 *          WE COULD SOLVE THIS BY ADDING SUPPORT OF SYMMETRIC ENCRYPTION TO THE MESSAGECOMM AND ENABLE THAT ALREADY FROM STEP 2.
 *
 * The Server will only reveal its identity as long as the Client already knows it.
 * The Client will only reveal its identity to the Server with the idenity it is expecting to connect to.
 *
 * The handshake process is as follows:
 *
 * 1.  Server creates SHARED_SECRET token.
 *     Send token to Client.
 *
 * 2.  Client read token.
 *     message         = <generate 32 random bytes>
 *     challenge       = symEncrypt(message, token)
 *     Send challenge to Server.
 *
 * 3.  Server reads challenge.
 *     message         = symDecrypt(challenge, token)
 *     signedMessage   = ed25519Wrapper.sign(message, serverKeys)
 *     Send signedMessage to Client.
 *
 * 4.  Client reads signedMessage.
 *     ed25519Wrapper.verify(signedMessage, message, serverPubKey)
 *     Client now understands she can trust the Server identity, and is ready to reveal her identity.
 *     clientPubKey     = symEncrypt(clientPubKey, token)
 *     parameters       = symEncrypt(parameters, token)
 *     innerEncrypt     = symEncrypt(innerEncrypt, token)
 *     clientEncKey     = symEncrypt(clientEncKey, token)
 *     signedMessage2   = ed25519Wrapper.sign(token, ClientKeys)
 *     Send (clientPubKey, parameters, innerEncrypt, clientEncKey, signedMessage2) to Server
 *
 * 5.  Server reads (clientPubKey, parameters, clientEncKey, signedMessage2).
 *     clientPubKey     = symDecrypt(clientPubKey, token)
 *     parameters       = symDecrypt(parameters, token)
 *     innerEncrypt     = symDecrypt(innerEncrypt, token)
 *     clientEncKey     = symDecrypt(clientEncKey, token)
 *     ed25519Wrapper.verify(signedMessage2, token, clientPubKey)
 *     Server has now learnt the Client's identity.
 *     matchPreferences(parameters, innerEncrypt)
 *
 *     if !isValid then close socket
 *     Server send ack:
 *     innerEncrypt     = symEncrypt(innerEncrypt, token)
 *     serverEncKey     = symEncrypt(serverEncKey, token)
 *     sharedParams     = symEncrypt(sharedParams, token)
 *     Send (innerEncrypt, serverEncKey, sharedParams)
 *
 * 6.  Client reads (innerEncrypt, serverEncKey, sharedParams)
 *     innerEncrypt     = symDecrypt(innerEncrypt, token)
 *     serverEncKey     = symDecrypt(serverEncKey, token)
 *     sharedParams     = symDecrypt(sharedParams, token)
 */

const ed25519 = require("../util/ed25519");
const Hash = require("../util/hash");
const Crypt = require("../util/crypt");
const {MessageEncoder} = require("./Message");
const nacl = require("tweetnacl");

/**
 * @typedef {Object} HandshakeClientMsgFormat
 * @property {string} serverPubKey
 */

/**
 * @typedef {Object} HandshakePhase3ResponseFormat
 * @property {string} protocolType
 * @property {string} protocolVersion
 * @property {string} rootNodeId
 */

/**
 * @param {MessageComm} messageComm should be corked.
 * @param {string} serverPubKey expected public key of server
 * @param {Object} keyPair client keypair
 * @param {string | Buffer} parameters client parameters sent to server for matching handshake preferecens
 * @param {number} innerEncryption level. 0 = auto, 1 = require
 * @return {Array<innerEncrypt, keyPair, serverEncKey> | null} null means failed handshake,
 *  innerEncrypt is the agreed upon inner encryption level, 0=no encryption, 1=use encryption
 *  keyPair and serverEncKey are session keys which can be used for transport encryption.
 */
async function AsClient(messageComm, serverPubKey, keyPair, parameters, innerEncryption)
{
    try {
        const sharedKey     = Hash.generateRandomBytes(32);

        // STEP 2
        const [token, incomingMsgId] = await ReadRandomToken(messageComm);
        if (!token || !incomingMsgId) {
            throw "Could not read server token.";
        }

        // Generate random challenge message.
        const message   = Buffer.from(Hash.generateRandomBytes(32));
        const challenge = Crypt.symmetricEncrypt(message, token);
        const message1  = new MessageEncoder(incomingMsgId);
        message1.addBinary("challenge", toBuffer(challenge));
        const messageBuffers1 = message1.pack();

        // Let one reply through.
        messageComm.uncork(1);

        const asyncRet1 = await messageComm.send(messageBuffers1, message1.getMsgId(), 10);

        // STEP 4
        if (!asyncRet1.isSuccess()) {
            throw "Could not proceed in 4";
        }

        const props1 = asyncRet1.getProps();
        const signedMessage = props1["signedMessage"];
        if (! ed25519.verify(signedMessage, message, serverPubKey)) {
            throw "Server signature does not match";
        }

        //
        // From here on Client can trust Server is who we expect it to be

        // Generate encryption keypair.
        const encKeyPair        = nacl.box.keyPair();
        const clientPubKey      = Crypt.symmetricEncrypt(Buffer.from(keyPair.pub), token);
        const innerEncrypt      = Crypt.symmetricEncrypt(Buffer.from(String(innerEncryption)), token);
        const signedMessage2    = ed25519.sign(token, keyPair);
        const clientEncKey      = Crypt.symmetricEncrypt(encKeyPair.publicKey, token);
        const parametersEnc     = Crypt.symmetricEncrypt(Buffer.from(parameters), token);

        // Let one reply through
        messageComm.uncork(1);

        const message2 = new MessageEncoder(asyncRet1.msgId());
        message2.addBinary("parameters",        toBuffer(parametersEnc));
        message2.addBinary("innerEncrypt",      toBuffer(innerEncrypt));
        message2.addBinary("clientPubKey",      toBuffer(clientPubKey));
        message2.addString("signedMessage2",    signedMessage2);
        message2.addBinary("clientEncKey",      toBuffer(clientEncKey));
        const messageBuffers2 = message2.pack();
        const asyncRet2 = await messageComm.send(messageBuffers2, message2.getMsgId(), 10);

        // STEP 6
        if (!asyncRet2.isSuccess()) {
            throw "Could not proceed in 6";
        }

        // If we come here server has ACK'd.
        const props2 = asyncRet2.getProps();

        const agreedUponInnerEncrypt    = Number(symDecryptToString(props2["innerEncrypt"], token));
        const serverEncKey              = Crypt.symmetricDecrypt(props2["serverEncKey"], token);
        const sharedParams              = symDecryptToString(props2["sharedParams"], token);

        return [sharedParams, agreedUponInnerEncrypt, encKeyPair, toBuffer(serverEncKey)];
    }
    catch(e) {
        console.error(e);
        return null;
    }
}

/**
 *
 */
function ReadRandomToken(messageComm)
{
    let token = Buffer.alloc(0);

    return new Promise( resolve => {
        // Setup timeout
        const tId = setTimeout( () => {
            messageComm.setRouter(null);
            resolve([null, null]);
        }, 10000);

        // Set the router and the messageComm in binary mode.
        messageComm.setRouter( async buffers => {
            try {
                token = Buffer.concat([token, ...buffers]);
                if (token.length > 32) {
                    throw "Invalid token";
                }
                if (token.length < 32) {
                    // Wait for more
                    return;
                }

                // We happen to know that the first four bytes of the token also correspond to the message ID on the other side.
                const msgId = token.toString("hex", 0, 4);

                clearTimeout(tId);
                messageComm.setRouter(null);
                resolve([token, msgId]);

            }
            catch(e) {
                console.error(e);
                clearTimeout(tId);
                messageComm.setRouter(null);
                resolve([null, null]);
            }
        }, true);
    });
}


/**
 * @param {MessageComm} messageComm should be corked.
 * @param {Object} server keyPair
 * @param {Function} ServerMatchAccept
 * @return {Array<curatedServerParams:Object, sharedParams:string, clientPubKey:string, innerEncryption:Number, encKeyPair, clientEncKey:Buffer> | null}
 *  null means handshake was not successful.
 *  curatedServerParams is the accepted curated params object from the servers accept params array.
 *  sharedParams is a string passed to client, passed here for reference
 *  clientPubKey is the client's ID.
 *  innerEncrypt is the agreed upon inner encryption level, 0=no encryption, 1=use encryption
 *  encKeyPair and clientEncKey are session keys which can be used for transport encryption.
 */
async function AsServer(messageComm, keyPair, ServerMatchAccept)
{
    try {
        // STEP 1
        //
        // Generate random handshake token.
        const token = Buffer.from(Hash.generateRandomBytes(32));

        // We create a message ID from the first four bytes of the token.
        // This is so we can setup a reply chain on the binary data we send.
        const msgId = token.toString("hex", 0, 4);

        // Let one reply through
        messageComm.uncork(1);

        // We are sending pure binary here, it requries the other end to have its messageComm set to binary mode, which is has with ReadRandomToken().
        const asyncRet1 = await messageComm.send([token], msgId, 10);

        // STEP 3
        if (!asyncRet1.isSuccess()) {
            throw "Client ends";
        }

        const props1 = asyncRet1.getProps();
        const challenge     = props1["challenge"];
        const message       = Crypt.symmetricDecrypt(challenge, token);
        const signedMessage = ed25519.sign(toBuffer(message), keyPair);

        //
        // Let one reply through
        messageComm.uncork(1);

        //
        // Encrypt shared key in a response to prove the server identity.
        const message2 = new MessageEncoder(asyncRet1.msgId());
        message2.addString("signedMessage", signedMessage);
        const buffers2 = message2.pack();
        const asyncRet2 = await messageComm.send(buffers2, message2.getMsgId(), 10);

        // STEP 5
        if (!asyncRet2.isSuccess()) {
            throw "Can't proceed";
        }
        const props2            = asyncRet2.getProps();
        const clientPubKey      = symDecryptToString(props2["clientPubKey"], token);
        const clientParameters  = symDecryptToString(props2["parameters"], token);
        const innerEncrypt      = symDecryptToString(props2["innerEncrypt"], token);
        const clientEncKey      = Crypt.symmetricDecrypt(props2["clientEncKey"], token);
        if (! ed25519.verify(props2["signedMessage2"], token, clientPubKey)) {
            throw "Client can't sign";
        }

        //
        // Match client public key and preferences with what server has to offer.
        const matched = await ServerMatchAccept(clientPubKey, clientParameters, Number(innerEncrypt));

        if (!matched) {
            // No match
            throw "Could not match client public key or preferences.";
        }

        const [curatedServerParams, sharedParams, innerEncryption] = matched;

        const sharedParamsEnc       = Crypt.symmetricEncrypt(Buffer.from(sharedParams), token);
        const innerEncryptionEnc    = Crypt.symmetricEncrypt(Buffer.from(String(innerEncryption)), token);

        // Generate encryption keypair.
        const encKeyPair        = nacl.box.keyPair();
        const serverEncKey      = Crypt.symmetricEncrypt(encKeyPair.publicKey, token);

        // SEND ACK
        const message3 = new MessageEncoder(asyncRet2.msgId());
        message3.addBinary("innerEncrypt",  toBuffer(innerEncryptionEnc));
        message3.addBinary("serverEncKey",  toBuffer(serverEncKey));
        message3.addBinary("sharedParams",  toBuffer(sharedParamsEnc));
        const buffers3 = message3.pack();
        messageComm.send(buffers3);

        // All GOOD!
        return [curatedServerParams, sharedParams, clientPubKey, innerEncryption, encKeyPair, toBuffer(clientEncKey)];
    }
    catch(e) {
        console.error(e);
        return null;
    }
}

/**
 * Convert ArrayBuffer to Buffer
 */
function toBuffer(ab) {
    var buf = Buffer.alloc(ab.byteLength);
    buf.set(ab);
    return buf;
}

function symDecryptToString(buf, token)
{
    return new TextDecoder("utf-8").decode(
        Crypt.symmetricDecrypt(buf, token));
}

module.exports = {AsClient, AsServer};
