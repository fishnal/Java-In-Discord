"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const readline = require("readline");
const fs = require("fs");
const https = require("https");
const minimist = require("minimist");
const errors_1 = require("./errors");
const processor_1 = require("./processor");
const utils_1 = require("./utils");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const jproc = new processor_1.JavaProcessor();
const client = new discord_js_1.Client();
const workspaceDir = 'c:/users/vpxbo/desktop/workspace/';
rl.question("Enter your Discord bot's token: ", token => {
    client.login(token).then(fulfilled => {
        console.log('successfully logged in: ' + fulfilled);
    }).catch(err => {
        console.log('failed to login: ' + err);
    });
});
client.on('ready', () => {
    console.log('Client ready!');
});
client.on('message', msg => {
    // only work with messages that are not sent by this bot
    if (msg.author != client.user) {
        let response = [];
        // determine if user want's to execute a java-based command
        if (msg.content.startsWith('```java') && msg.content.endsWith('```')) {
            let lines = msg.content.split('\n');
            let status;
            let i = 1;
            for (; i < lines.length; i++) {
                if (utils_1.removeWhitespace(lines[i]).length != 0) {
                    if (lines[i].startsWith('// repl')) {
                        status = processor_1.JavaProcessor.REPL_CODE;
                    }
                    else if (lines[i].startsWith('// comp')) {
                        status = processor_1.JavaProcessor.FILE_COMP_CODE;
                    }
                    break;
                }
            }
            if (status) {
                let commandString = lines[i].substring('// xxxx'.length).trimLeft();
                let commandArgs = utils_1.splitArgs(commandString);
                let commandOpts = minimist(commandArgs);
                if (commandOpts['--timeout'] != null && typeof commandOpts['--timeout'] == 'boolean') {
                    response.push('Whoops! You forgot to add a value for the `timeout` option!');
                    status = undefined;
                }
                switch (status) {
                    case processor_1.JavaProcessor.REPL_CODE: {
                        msg.reply("Running your Java snippet....");
                        try {
                            let output = jproc.repl(lines.slice(i + 1, lines.length - 1).join('\n'), {
                                timeout: commandOpts['timeout']
                            });
                            if (output == '' || output == null) {
                                response.push("Didn't receive anything from the snippet :confused:");
                            }
                            else {
                                while (output.indexOf('\r\n') >= 0) {
                                    output = output.replace('\r\n', '\n');
                                }
                                if (!output.startsWith('```\n')) {
                                    output = '```\n' + output;
                                }
                                if (!output.endsWith('\n')) {
                                    output += '\n';
                                }
                                output += '```';
                                response.push("Here's your snippet output:");
                                response.push(output);
                            }
                        }
                        catch (err) {
                            if (err instanceof RangeError) {
                                // invalid timeout value
                                response.push('Whoops! ' + err.message + '!');
                            }
                            else {
                                response.push('Something went wrong and an error was produced:');
                                response.push(err);
                            }
                        }
                        msg.reply(response);
                        break;
                    }
                    case processor_1.JavaProcessor.FILE_COMP_CODE: {
                        if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
                            response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
                            msg.reply(response);
                            break;
                        }
                        else if (commandOpts['file'] != null && typeof commandOpts['file'] == 'boolean') {
                            response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
                            msg.reply(response);
                            break;
                        }
                        try {
                            let output = jproc.compileString(lines.slice(i + 1, lines.length - 1).join('\n'), {
                                timeout: commandOpts['timeout'],
                                jdkCompiler: commandOpts['jdkCompiler'],
                                file: commandOpts['file']
                            });
                            if (output != null) {
                                response.push("Your Java file didn't compile properly! Here's the log:");
                                response.push(output);
                            }
                            else {
                                response.push("Your Java file compiled successfully!");
                            }
                        }
                        catch (err) {
                            if (err instanceof RangeError) {
                                response.push('Whoops! ' + err.message + '!');
                            }
                            else if (err instanceof errors_1.JDKError) {
                                response.push("Whoops! That's an invalid JDK!");
                            }
                            else {
                                response.push('Something went wrong and an error was produced:');
                                response.push(err);
                            }
                        }
                        msg.reply(response);
                        break;
                    }
                    default: {
                        msg.reply(response);
                        break;
                    }
                }
            }
        }
        let attachments = msg.attachments;
        attachments.forEach((v, k, m) => {
            if (!fs.existsSync(workspaceDir)) {
                fs.mkdirSync(workspaceDir);
            }
            let file = workspaceDir + v.filename;
            https.get(v.url, resp => {
                resp.on('end', () => {
                    if (response.length != 0) {
                        response[0] = 'Received your files!';
                    }
                    else {
                        response.push('Received your file!');
                    }
                    if (msg.content.startsWith('// comp') && v.filename.endsWith('.java')) {
                        let commandString = msg.content.substring('// xxxx'.length).trimLeft();
                        let commandArgs = utils_1.splitArgs(commandString);
                        let commandOpts = minimist(commandArgs);
                        if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
                            response.push('Whoops! You forgot to add a value for the `timeout` option!');
                        }
                        if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
                            response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
                        }
                        response.push("It's a Java file! Let me compile that real quick...");
                        try {
                            let output = jproc.compileFile(file, {
                                timeout: commandOpts['timeout'],
                                jdkCompiler: commandOpts['jdkCompiler']
                            });
                            if (output == null) {
                                response.push("You're Java file compiled successfully!");
                            }
                            else {
                                response.push("You're Java file had some issues compiling:\n```\n"
                                    + output + "\n```");
                            }
                        }
                        catch (err) {
                            if (err instanceof RangeError) {
                                response.push('Whoops! ' + err.message + '!');
                            }
                            else if (err instanceof errors_1.JDKError) {
                                response.push("Whoops! That's an invalid JDK!");
                            }
                            else {
                                response.push('Something went wrong and an error was produced:');
                                response.push(err);
                            }
                        }
                    }
                    msg.reply(response);
                });
                resp.pipe(fs.createWriteStream(file));
            }).on('error', err => {
                msg.reply('There was an issue receiving your file :frowning:\n'
                    + '```\n' + err + '\n```');
            });
        });
    }
});
//# sourceMappingURL=discord_client.js.map