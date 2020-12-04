#!/usr/bin/env node

const {HubServer, HubClient} = require("./Hub");

const serverTCP = {
    listen: {
        protocol: "tcp",
        host: "0.0.0.0",
        port: 9191,
    }
};

const serverWS = {
    listen: {
        protocol: "websocket",
        host: "0.0.0.0",
        port: 9192,
    }
};

HubServer([serverTCP, serverWS]);
