"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("./jid_utils");
const fs = require("fs");
const fse = require("fs-extra");
const util = require("util");
const cp = require("child_process");
const interfaces = require("./interfaces");
const errors = require("./errors");
const logger_1 = require("./logger");
const util_1 = require("util");
/**
 * Processes Java REPL scripts and compilations.
 */
class JavaProcessor {
    /**
     * Constructs a JavaProcessor object.
     *
     * @param deps: the dependencies to initialize this JavaProcessor with.
     */
    constructor(deps) {
        this.deps = deps;
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
        logger_1.Logger.debug("Validating timeout");
        if (!(timeout >= JavaProcessor.MIN_TIMEOUT && timeout <= JavaProcessor.MAX_TIMEOUT)) {
            throw new RangeError(util.format('Invalid timeout value (between %dms and %dms)', JavaProcessor.MIN_TIMEOUT, JavaProcessor.MAX_TIMEOUT));
        }
    }
    /**
     * Fixes a Java snippet line endings and the ending of the content.
     * @param snippet the Java REPL snippet
     * @returns the fixed Java snippet.
     */
    static fixSnippet(snippet) {
        logger_1.Logger.debug("Fixing snippet (CRLF -> LF, end w/LF, end w/exit)");
        while (snippet.indexOf('\r\n') >= 0) {
            snippet = snippet.replace('\r\n', '\n');
        }
        if (!snippet.endsWith('\n')) {
            snippet += '\n';
        }
        if (!snippet.endsWith('/exit\n')) {
            snippet += '/exit\n';
        }
        logger_1.Logger.debug("Snippet fixed");
        return snippet;
    }
    /**
     * Validates a dependency exists before using it.
     *
     * @param dep the dependency to look for.
     */
    validateDependency(dep) {
        logger_1.Logger.debug("Validating dependency");
        if (!this.deps[dep]) {
            throw new errors.DependencyError(util.format('dependency [%O] not found', dep));
        }
    }
    /**
     * Sets the dependencies for this JavaProcessor.
     *
     * @param deps the new dependencies.
     */
    setDependencies(deps) {
        this.deps = deps;
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
        this.validateDependency('jshell');
        snippet = JavaProcessor.fixSnippet(snippet);
        let jshFile = '$' + utils.randString() + '.jsh';
        logger_1.Logger.debug(util_1.format("Snippet in temp file %s", jshFile));
        fs.writeFileSync(jshFile, snippet);
        let outputPipe = new utils.StringWriter();
        try {
            logger_1.Logger.debug(util_1.format("Synchronously executing file %s with options %o", this.deps['jshell'], opts));
            outputPipe.write(cp.execFileSync(this.deps['jshell'], [jshFile], {
                encoding: 'utf-8',
                timeout: opts.timeout
            }));
            logger_1.Logger.debug("Returning output from synchronous execution");
            return outputPipe.getData();
        }
        catch (err) {
            throw err;
        }
        finally {
            logger_1.Logger.debug(util_1.format("Deleting temp file %s", jshFile));
            fs.unlinkSync(jshFile);
        }
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
            jdkCompiler: 'javac8',
            file: '$' + utils.randString() + '.java',
        });
        JavaProcessor.validateTimeout(opts.timeout);
        this.validateDependency(opts.jdkCompiler);
        let outputPipe = new utils.StringWriter();
        logger_1.Logger.debug(util_1.format("Storing input string in temp file %s", opts.file));
        fs.writeFileSync(opts.file, compileString);
        /* place generated class files from compilation in a temp directory */
        let dir = 'jid_cache_' + utils.randString() + '/';
        logger_1.Logger.debug(util_1.format("Storing generated class file(s) into temp directory %s", dir));
        try {
            fs.mkdirSync(dir);
            logger_1.Logger.debug(util_1.format("Synchronously spawning process for command %s with options %o", this.deps[opts.jdkCompiler], opts));
            outputPipe.write(cp.spawnSync(this.deps[opts.jdkCompiler], ['-d', dir, opts.file], {
                cwd: process.cwd(),
                timeout: opts.timeout,
                encoding: 'utf8'
            }).stderr);
        }
        catch (err) {
            throw err;
        }
        finally {
            logger_1.Logger.debug(util_1.format("Deleting temp file (%s) and directory (%s)", opts.file, dir));
            fs.unlinkSync(opts.file);
            fse.removeSync(dir);
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
        this.validateDependency(opts.jdkCompiler);
        let outputPipe = new utils.StringWriter();
        let dir = 'jid_cache_' + utils.randString() + '/';
        logger_1.Logger.debug(util_1.format("Storing generated class file(s) into temp directory %s", dir));
        try {
            fs.mkdirSync(dir);
            logger_1.Logger.debug(util_1.format("Synchronously spawning process for command %s with options %o", this.deps[opts.jdkCompiler], opts));
            outputPipe.write(cp.spawnSync(this.deps[opts.jdkCompiler], ['-d', dir, file], {
                cwd: process.cwd(),
                timeout: opts.timeout,
                encoding: 'utf8'
            }).stderr);
        }
        catch (err) {
            throw err;
        }
        finally {
            logger_1.Logger.debug(util_1.format("Deleting temp directory (%s)", dir));
            fse.removeSync(dir);
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
exports.JavaProcessor = JavaProcessor;
//# sourceMappingURL=processor.js.map