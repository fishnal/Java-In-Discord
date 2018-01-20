"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors = require("./errors");
const utils = require("./utils");
const pty = require("node-pty");
const fs = require("fs");
const util = require("util");
const cp = require("child_process");
const utils_1 = require("./utils");
class Server {
    /**
     * Constructs a Server object.
     */
    constructor() {
        /* TODO read in workspaces
         * if no workspaces present, then print this info
         * if workspaces present, print which ones were read in
         * if a user w/o a workspace makes a request, ask them if they want to setup one
             * offer 3 options: yes, not now, don't ask again
             * if don't ask again is selected, let them know they can make a workspace anytime
             * by executing a certain command
         * user can request for their workspace to be purged (removes all files in their workspace)
         * user can request to remove their workspace entirely
         *
         */
    }
    /**
     * Returns a list of the supported JDKs.
     * @returns list of supported JDKs.
     */
    static getSupportedJDKs() {
        let jdks = [];
        for (let jdk in Server.supportedJDKs) {
            jdks.push(jdk);
        }
        return jdks;
    }
    /**
     * Validates a timeout duration is in range of the min and max values
     * specified by Server#MIN_TIMEOUT and Server#MAX_TIMEOUT
     *
     * @param timeout the timeout duration
     * @throws RangeError if the timeout is not in range of the min and max
     * values.
     */
    static validateTimeout(timeout) {
        if (timeout < Server.MIN_TIMEOUT || timeout > Server.MAX_TIMEOUT) {
            throw new RangeError(util.format('invalid timeout value (between %dms and %dms)', Server.MIN_TIMEOUT, Server.MAX_TIMEOUT));
        }
    }
    /**
     * Validates a JDK compiler choice by checking if it exists in
     * Server#supportedJDKs
     *
     * @param jdkCompiler the JDK compiler choice.
     * @throws JDKError if the choice is not valid.
     */
    static validateJDKCompiler(jdkCompiler) {
        if (!Server.supportedJDKs[jdkCompiler]) {
            throw new errors.JDKError(util.format('valid JDK compilers: %O', Server.supportedJDKs));
        }
    }
    static fixSnippet(snippet) {
        while (snippet.indexOf('\r\n') >= 0) {
            snippet = snippet.replace('\r\n', '\n');
        }
        if (!snippet.endsWith('\n')) {
            snippet += '\n';
        }
        if (!snippet.endsWith('/exit\n')) {
            snippet += '/exit';
        }
        return snippet;
    }
    /**
     * Unlinks the generated class file from this java file.
     * @param {string} file the file path
     */
    static unlinkGeneratedClass(file) {
        let baseFile = file.substring(0, file.lastIndexOf('.'));
        let classFile = baseFile + '.class';
        fs.unlinkSync(classFile);
    }
    static exit(process) {
        // find a way to tell if input is finished
        process.kill();
        throw new errors.TimeoutError();
    }
    /**
     * Runs a Java REPL snippet using Java 9's "jshell" environment. Times out
     * after a certain duration. If you're looking to see if a file compiles,
     * see Server#compileString(string, number, string) and
     * Server#compileFile(string, number, string).
     *
     * @param snippet the Java REPL snippet
     * @param timeout the timeout in milliseconds (default: 5000); must fall in range
     * of Server.MIN_TIMEOUT and Server.MAX_TIMEOUT
     * @see Server#compileString
     * @see Server#compileFile
     */
    repl(snippet, { timeout = 5000 }) {
        Server.validateTimeout(timeout);
        snippet = Server.fixSnippet(snippet);
        let inputBufferIndex = 0;
        let inputBuffer = snippet.split('\n');
        let output = '';
        console.log('Running snippet...');
        let jshell = 'C:/Program Files/Java/jdk-9/bin/jshell.exe';
        let process = pty.spawn(jshell, []);
        let timer = setTimeout(Server.exit, timeout, process);
        process.setEncoding('utf-8');
        process.on('data', data => {
            if (inputBufferIndex < inputBuffer.length) {
                process.write(inputBuffer[inputBufferIndex++] + "\n");
            }
            console.log(data);
            output += data;
        });
        process.on('close', code => {
            clearTimeout(timer);
            console.log('process exited');
            console.log('output:');
            console.log(output);
        });
    }
    /**
     * Compiles a Java string using a certain JDK. Treats it as if it were
     * compiling it from a file. Tmes out after a given duration.
     *
     * EX: 'int a = 2;' does not compile
     * EX: 'class A { }' does compile
     * EX: 'public class A { }' compiles if it is specified to be in a "file"
     * 		'A.java' if no file is specified, then this will very likely fail
     * 		as the file name that is chosen is random (specified by
     * 		Utils#randString(number))
     *
     * @param compileString the Java string to compile.
     * @param timeout the timeout in milliseconds (default: 5000); must fall in range
     * of Server.MIN_TIMEOUT and Server.MAX_TIMEOUT
     * @param options a map of options; can specify which JDK to use for
     * compilation (defaults to 'jdk8'), a "file" to compile in (defaults to some
     * random string)
     * @see Server#getSupportedJDKs for a list of supported JDKs
     */
    compileString(compileString, { timeout = 5000, jdkCompiler = 'jdk8', file = '$' + utils.randString() + '.java' }) {
        Server.validateTimeout(timeout);
        Server.validateJDKCompiler(jdkCompiler);
        let compilerPath = Server.supportedJDKs[jdkCompiler];
        let outputPipe = new utils_1.StringWriter();
        console.log('Compiling string...');
        fs.writeFileSync(file, compileString);
        try {
            outputPipe.write(cp.spawnSync(compilerPath, [file], {
                cwd: process.cwd(),
                timeout: timeout,
                encoding: 'utf8'
            }).stderr);
            Server.unlinkGeneratedClass(file);
            fs.unlinkSync(file);
        }
        catch (err) {
            if (err.message.indexOf('TIMEDOUT') >= 0) {
                // execution timed out, record that
                outputPipe.write('execution timed out');
            }
            else {
                outputPipe.write(err.message);
            }
        }
        if (outputPipe.getData() == '') {
            outputPipe.write('Successful compilation');
        }
        return outputPipe.getData();
    }
    /**
     * Compiles a Java file using a certain JDK.  Tmes out after a given
     * duration.
     *
     * @param file the Java file to compile.
     * @param timeout the timeout in milliseconds (default: 5000); must fall in range
     * of Server.MIN_TIMEOUT and Server.MAX_TIMEOUT
     * @param options a map of options; can specify which JDK to use for
     * compilation (defaults to 'jdk8') and timeout duration.
     * @see Server#getSupportedJDKs for a list of supported JDKs
     */
    compileFile(file, { timeout = 5000, jdkCompiler = 'jdk8' }) {
        Server.validateTimeout(timeout);
        Server.validateJDKCompiler(jdkCompiler);
        let compilerPath = Server.supportedJDKs[jdkCompiler];
        let outputPipe = new utils_1.StringWriter();
        console.log('Compiling file...');
        try {
            outputPipe.write(cp.spawnSync(compilerPath, [file], {
                cwd: process.cwd(),
                timeout: timeout,
                encoding: 'utf8'
            }).stderr);
            // get generated class file: file.baseName + '.class'
            Server.unlinkGeneratedClass(file);
        }
        catch (err) {
            if (err.message.indexOf('TIMEDOUT') >= 0) {
                // execution timed out, record that
                outputPipe.write('execution timed out');
            }
            else {
                outputPipe.write(err.message);
            }
        }
        if (outputPipe.getData() == '') {
            outputPipe.write('Successful compilation');
        }
        return outputPipe.getData();
    }
}
/**
 * Minimum timeout duration.
 */
Server.MIN_TIMEOUT = 1000;
/**
 * Maximum timeout duration.
 */
Server.MAX_TIMEOUT = 20000;
/**
 * Supported JDKs.
 */
Server.supportedJDKs = {
    'jdk8': 'c:/program files/java/jdk1.8.0_144/bin/javac.exe',
    'jdk9': 'c:/program files/java/jdk-9/bin/javac.exe'
};
exports.Server = Server;
