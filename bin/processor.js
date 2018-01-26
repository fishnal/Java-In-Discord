"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("./utils");
const fs = require("fs");
const fse = require("fs-extra");
const util = require("util");
const cp = require("child_process");
const utils_1 = require("./utils");
const interfaces = require("./interfaces");
const errors = require("./errors");
/**
 * Processes Java REPL scripts and compilations.
 */
class JavaProcessor {
    /**
     * Constructs a JavaProcessor object.
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
        for (let jdk in JavaProcessor.supportedJDKs) {
            jdks.push(jdk);
        }
        return jdks;
    }
    /**
     * Validates a timeout duration is in range of the min and max values
     * specified by JavaProcessor#MIN_TIMEOUT and JavaProcessor#MAX_TIMEOUT
     *
     * @param timeout the timeout duration
     * @throws RangeError if the timeout is not in range of the min and max
     * values.
     */
    static validateTimeout(timeout) {
        if (!(timeout >= JavaProcessor.MIN_TIMEOUT && timeout <= JavaProcessor.MAX_TIMEOUT)) {
            throw new RangeError(util.format('Invalid timeout value (between %dms and %dms)', JavaProcessor.MIN_TIMEOUT, JavaProcessor.MAX_TIMEOUT));
        }
    }
    /**
     * Validates a JDK compiler choice by checking if it exists in
     * JavaProcessor#supportedJDKs
     *
     * @param jdkCompiler the JDK compiler choice.
     * @throws JDKError if the choice is not valid.
     */
    static validateJDKCompiler(jdkCompiler) {
        if (!JavaProcessor.supportedJDKs[jdkCompiler]) {
            throw new errors.JDKError(util.format('valid JDK compilers: %O', JavaProcessor.supportedJDKs));
        }
    }
    /**
     * Fixes a Java snippet line endings and the ending of the content.
     * @param snippet the Java REPL snippet
     * @returns the fixed Java snippet.
     */
    static fixSnippet(snippet) {
        while (snippet.indexOf('\r\n') >= 0) {
            snippet = snippet.replace('\r\n', '\n');
        }
        if (!snippet.endsWith('\n')) {
            snippet += '\n';
        }
        if (!snippet.endsWith('/exit\n')) {
            snippet += '/exit\n';
        }
        return snippet;
    }
    /**
     * Runs a Java REPL snippet using Java 9's "jshell" environment. Times out
     * after a certain duration. If you're looking to see if a file compiles,
     * see JavaProcessor#compileString(string, number, string) and
     * JavaProcessor#compileFile(string, number, string).
     *
     * @param snippet the Java REPL snippet
     * @param timeout the timeout in milliseconds (default: 5000); must fall in range
     * of JavaProcessor.MIN_TIMEOUT and JavaProcessor.MAX_TIMEOUT
     * @returns the output of the snippet including any errors that occur during
     * execution (errors and normal outputs are not distinguished)
     * @see JavaProcessor#compileString
     * @see JavaProcessor#compileFile
     */
    repl(snippet, opts = {}, callback = (err, output) => { }) {
        interfaces.defaultOptions(opts, {
            timeout: 5000
        });
        JavaProcessor.validateTimeout(opts.timeout);
        snippet = JavaProcessor.fixSnippet(snippet);
        let jshFile = '$' + utils.randString() + '.jsh';
        fs.writeFileSync(jshFile, snippet);
        let outputPipe = new utils_1.StringWriter();
        let jshell = 'C:/Program Files/Java/jdk-9/bin/jshell.exe';
        outputPipe.write(cp.spawnSync(jshell, [jshFile], {
            encoding: 'utf-8',
            timeout: opts.timeout
        }).stdout);
        fs.unlinkSync(jshFile);
        return outputPipe.getData();
    }
    /**
     * Compiles a Java string using a certain JDK. Treats it as if it were
     * compiling it from a file. Tmes out after a given duration.
     *
     * EX: 'int a = 2;' does not compile
     * EX: 'class A { }' does compile
     * EX: 'public class A { }' compiles if it is specified to be in a "file"
     * 		'A.java' (if no file is specified, then this will fail)
     *
     * @param compileString the Java string to compile.
     * @param timeout the timeout in milliseconds (default: 5000); must fall in range
     * of JavaProcessor.MIN_TIMEOUT and JavaProcessor.MAX_TIMEOUT
     * @param options a map of options; can specify which JDK to use for
     * compilation (defaults to 'jdk8'), a "file" to compile in (defaults to some
     * random string)
     * @see JavaProcessor#getSupportedJDKs for a list of supported JDKs
     */
    compileString(compileString, opts = {}) {
        interfaces.defaultOptions(opts, {
            timeout: 5000,
            jdkCompiler: 'jdk8',
            file: '$' + utils.randString() + '.java',
        });
        JavaProcessor.validateTimeout(opts.timeout);
        JavaProcessor.validateJDKCompiler(opts.jdkCompiler);
        let compilerPath = JavaProcessor.supportedJDKs[opts.jdkCompiler];
        let outputPipe = new utils_1.StringWriter();
        fs.writeFileSync(opts.file, compileString);
        try {
            let dir = 'jid_cache_' + utils.randString() + '/';
            fs.mkdirSync(dir);
            outputPipe.write(cp.spawnSync(compilerPath, ['-d', dir, opts.file], {
                cwd: process.cwd(),
                timeout: opts.timeout,
                encoding: 'utf8'
            }).stderr);
            fs.unlinkSync(opts.file);
            fse.removeSync(dir);
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
            return null;
        }
        return outputPipe.getData();
    }
    /**
     * Compiles a Java file using a certain JDK.  Tmes out after a given
     * duration.
     *
     * @param file the Java file to compile.
     * @param timeout the timeout in milliseconds (default: 5000); must fall in range
     * of JavaProcessor.MIN_TIMEOUT and JavaProcessor.MAX_TIMEOUT
     * @param options a map of options; can specify which JDK to use for
     * compilation (defaults to 'jdk8') and timeout duration.
     * @see JavaProcessor#getSupportedJDKs for a list of supported JDKs
     */
    compileFile(file, opts = {}) {
        interfaces.defaultOptions(opts, {
            timeout: 5000,
            jdkCompiler: 'jdk8'
        });
        JavaProcessor.validateTimeout(opts.timeout);
        JavaProcessor.validateJDKCompiler(opts.jdkCompiler);
        let compilerPath = JavaProcessor.supportedJDKs[opts.jdkCompiler];
        let outputPipe = new utils_1.StringWriter();
        try {
            let dir = 'jid_cache_' + utils.randString() + '/';
            fs.mkdirSync(dir);
            outputPipe.write(cp.spawnSync(compilerPath, ['-d', dir, file], {
                cwd: process.cwd(),
                timeout: opts.timeout,
                encoding: 'utf8'
            }).stderr);
            fse.removeSync(dir);
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
            return null;
        }
        return outputPipe.getData();
    }
}
/**
 * Identifier for REPL.
 */
JavaProcessor.REPL_CODE = 1;
/**
 * Identifier for file compilation.
 */
JavaProcessor.FILE_COMP_CODE = 2;
/**
 * Identifier for string compilation.
 */
JavaProcessor.STRING_COMP_CODE = 3;
/**
 * Minimum timeout duration.
 */
JavaProcessor.MIN_TIMEOUT = 1000;
/**
 * Maximum timeout duration.
 */
JavaProcessor.MAX_TIMEOUT = 20000;
/**
 * Supported JDKs.
 */
JavaProcessor.supportedJDKs = {
    'jdk8': 'c:/program files/java/jdk1.8.0_144/bin/javac.exe',
    'jdk9': 'c:/program files/java/jdk-9/bin/javac.exe'
};
exports.JavaProcessor = JavaProcessor;
//# sourceMappingURL=processor.js.map