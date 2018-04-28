"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const minimist = require("minimist");
const fs = require("fs");
const JIDBot = require("./discord_client");
const PORT = process.env.PORT || 5000;
const app = express();
app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
    console.log(`Executing discord_client`);
    /* read token in from file (cmd line arg) */
    let cmdLineOpts = minimist(process.argv.slice(2));
    let token;
    if (cmdLineOpts['token']) {
        token = fs.readFileSync(cmdLineOpts['token']).toString();
    }
    JIDBot.start(token);
});
//# sourceMappingURL=app.js.map