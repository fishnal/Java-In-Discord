"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readline = require("readline");
const te = require("text-encoding");
const fs = require("fs");
const server_1 = require("./server");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const encoder = new te.TextEncoder('utf-8');
const decoder = new te.TextDecoder('utf-8');
console.log('Running client');
rl.question('Enter text file path to read Java REPL example from: ', path => {
    fs.readFile(path, (err, buffer) => {
        if (err) {
            console.log(err);
        }
        else {
            let string = decoder.decode(buffer);
            let server = new server_1.Server();
            server.repl(string, { timeout: 20000 });
        }
    });
});
//# sourceMappingURL=client.js.map