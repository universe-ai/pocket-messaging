#!/usr/bin/env node

const {HubServer, HubClient} = require("../pocket-messaging/Hub");

const serverTCP = {
    listen: {
        protocol: "tcp",
        host: "localhost",
        port: 9191,
    }
};

const serverWS = {
    listen: {
        protocol: "websocket",
        host: "localhost",
        port: 9192,
    }
};

HubServer([serverTCP, serverWS]);
