# pocket-messaging

Don't just `JSON.stringify` and send your data, use [pocket-messaging](https://github.com/universe-ai/pocket-messaging) to pack and send it to a trusted peer.

This project has been extracted as a standalone project from the [Universe-ai/core-js](https://github.com/universe-ai/core-js) project and can be used on its own together with the [pocket-sockets](https://github.com/universe-ai/pocket-sockets) library.

It handshakes using public-key cryptography and can add an additional layer of encryption to the communication on top of _TLS_, if needed (for example when _TLS_ termination is provided as a service or not available at all).

## Current status
*!!The Handshake process is not yet secure!!*

Examples and documentation will be added.

## License
This project is released under the _MIT_ license. Refer to the [LICENSE](https://github.com/universe-ai/pocket-messaging/blob/master/LICENSE) file for details.
