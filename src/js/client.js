"use strict";

const readline = require("readline");
const te = require("text-encoding");
const fs = require("fs");
const Server = require("./server").Server;
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
        } else {
            let string = decoder.decode(buffer);
            let server = new Server();
            server.repl(string, { timeout: 20000 });
        }
    });
});
