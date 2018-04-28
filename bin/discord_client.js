"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const fs = require("fs");
const https = require("https");
const mkdirp = require("mkdirp");
const minimist = require("minimist");
const interfaces = require("./interfaces");
const util_1 = require("util");
const errors_1 = require("./errors");
const processor_1 = require("./processor");
const jid_utils_1 = require("./jid_utils");
const logger_1 = require("./logger");
/* max output length that bot will preview in the text channel
 * (includes any other characters bot needs to add)
 */
const MAX_OUTPUT_PREVIEW_LEN = 200;
/* poor way of preventing other messages from being processed at once. */
let syncer = new (class BadSynchronizer {
    constructor() {
        this.inUse = false;
    }
    setInUse(value) {
        if (this.inUse != value) {
            if (this.inUse) {
                /* previously in use, now no longer in use */
                logger_1.Logger.debug("Bot no longer in use");
            }
            else {
                logger_1.Logger.debug("Bot is in use");
            }
            this.inUse = value;
        }
    }
    getInUse() {
        return this.inUse;
    }
});
let clientOpts;
let client;
let jproc;
function start(token, logLevel) {
    logger_1.Logger.setLevel(logLevel ? logLevel : logger_1.Logger.DEBUG);
    jproc = new processor_1.JavaProcessor();
    client = new discord_js_1.Client();
    /* TODO need to get rid of this */
    logger_1.Logger.debug("Processing options for client");
    clientOpts = processClientOpts([]);
    /* make workspace directory if it doesn't exist */
    if (!fs.existsSync(clientOpts.workspace)) {
        logger_1.Logger.debug(util_1.format("Creating directory %s", clientOpts.workspace));
        fs.mkdirSync(clientOpts.workspace);
    }
    /* login client */
    client.login(token).then(fulfilled => {
        logger_1.Logger.info("Logged in");
    }).catch(err => {
        logger_1.Logger.err("Failed to login");
        logger_1.Logger.err(err);
        process.exit(1);
    });
    /* client's good to go */
    client.on('ready', () => {
        logger_1.Logger.info('Client ready!');
    }).on('disconnect', (event) => {
        logger_1.Logger.info('Disconnecting....');
        process.exit(0);
    });
    /* do something whenever client gets a message */
    client.on('message', msg => {
        /* only work with messages that are not sent by this bot */
        if (msg.author != client.user) {
            if (syncer.getInUse()) {
                logger_1.Logger.debug("Bot currently performing a task");
                msg.reply("I'm busy right now, try later.");
                return;
            }
            /* this should always be set to false at some point */
            syncer.setInUse(true);
            /* determine if user wants to execute a java-based command */
            let content = msg.content;
            if (content.startsWith('```java') && content.endsWith('```')) {
                logger_1.Logger.debug("Processing java command");
                processJavaCommand(msg);
            }
            else if (msg.attachments.size > 0) {
                logger_1.Logger.debug("Processing attachments");
                processAttachments(msg, msg.attachments);
            }
            else {
                syncer.setInUse(false);
            }
        }
    });
}
exports.start = start;
function processClientOpts(args) {
    let opts = {};
    /* supported properties */
    let props = ['workspace', 'config', 'jshell', 'javac8', 'javac9'];
    logger_1.Logger.debug("Setting each client option property to equivalent provided command line option");
    /* for-each property, set opts[prop] to the parsed options of "--prop_name";
     * not that if "--prop_name" is undefined in parsed options, then it is still
     * added to our options, but we never look at it
     */
    props.forEach(prop => {
        opts[prop] = args['--' + prop];
        if (args['--' + prop]) {
            logger_1.Logger.debug(util_1.format("opts[%s] = %s", prop, args['--' + prop]));
        }
    });
    /* dependencies for the java processor */
    logger_1.Logger.debug("Getting dependencies");
    let deps = jid_utils_1.findDeps();
    jproc.setDependencies(deps);
    /* default options for our client (these are overridden by user's options) */
    logger_1.Logger.debug("Defaulting to client options (overridden by a config file if provided)");
    interfaces.defaultOptions(opts, {
        workspace: 'workspace/',
        config: undefined,
        jshell: opts.config ? undefined : deps['jshell'],
        javac9: opts.config ? undefined : deps['javac9'],
        javac8: opts.config ? undefined : deps['javac8']
    });
    /* add an ending slash to the workspace property if needed */
    if (!opts.workspace.endsWith('/') && !opts.workspace.endsWith('\\')) {
        logger_1.Logger.debug("Appending a forward-slash to workspace path");
        opts.workspace += '/';
        logger_1.Logger.debug(util_1.format("Workspace path is now %s", opts.workspace));
    }
    /* if user provides a JSON configuration file which identifies the dependencies
     * for the java processor, then use that */
    if (opts.config) {
        logger_1.Logger.info("Applying config file settings to client options");
        /* read in JSON config file */
        logger_1.Logger.debug("Parsing JSON config file");
        let configData = JSON.parse(fs.readFileSync(opts.config).toString());
        /* assign config properties appropriately */
        opts.jshell = configData['jshell'];
        opts.javac9 = configData['javac9'];
        opts.javac8 = configData['javac8'];
        logger_1.Logger.debug("Finished applying config file settings");
    }
    for (let key in opts) {
        logger_1.Logger.debug(util_1.format('opts[%s] = %s', key, opts[key]));
    }
    /* if our status is non-zero, then something could go wrong
     * for example, a jshell environment isn't properly provided, and when
     * user tries to run a java snippet, it won't run b/c there's nothing
     * that can run the snippet */
    if (deps.status) {
        logger_1.Logger.warn(util_1.format("Configuration status code = %d", status));
    }
    return opts;
}
function processJavaCommand(msg) {
    /* pattern for checking if command exists */
    const commandExpression = "\\s*\\/\\/\\s*";
    /* length of command */
    let commandLength;
    /* match result for the command */
    let match;
    /* response for bot */
    let response = [];
    /* lines for bot to parse/process */
    let lines = msg.content.split('\n');
    /* the kind of command we're dealing with */
    let status;
    logger_1.Logger.debug("Finding java command in codeblock");
    let i = 1;
    for (; i < lines.length; i++) {
        /* `//repl` and `//comp` (and variations) should be the first non-whitespace line
         * if we want to process these lines
         */
        if (jid_utils_1.removeWhitespace(lines[i]).length != 0) {
            /* not an empty line after removing the whitespace */
            /* check if it's repl or comp and set status accordingly */
            if (match = lines[i].match(commandExpression + 'repl')) {
                status = processor_1.JavaProcessor.REPL_CODE;
            }
            else if (match = lines[i].match(commandExpression + 'comp')) {
                status = processor_1.JavaProcessor.FILE_COMP_CODE;
            }
            /* if we have a valid command, update commandLength */
            if (status) {
                commandLength = match[0].length;
            }
            logger_1.Logger.debug(util_1.format("Found command \"%s\"", status == processor_1.JavaProcessor.REPL_CODE ? 'repl' : 'comp'));
            break;
        }
    }
    /* do something with command if it exists, otherwise do nothing */
    if (status) {
        logger_1.Logger.debug("Stripping arguments from command");
        /* strips command itself and leaves us with arguments for the command */
        let commandString = lines[i].substring(commandLength).trimLeft();
        /* split the arguments */
        let commandArgs = jid_utils_1.splitArgs(commandString);
        /* parse the arguments */
        let commandOpts = minimist(commandArgs);
        /* if user provides timeout option but doesn't specify what the value is, then bad */
        if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
            logger_1.Logger.err(util_1.format("No value for timeout option [input: %s]", commandString));
            response.push('Whoops! You forgot to add a value for the `timeout` option!');
            status = undefined;
        }
        switch (status) {
            case processor_1.JavaProcessor.REPL_CODE: {
                logger_1.Logger.info("Running Java snippet...");
                msg.reply("Running your Java snippet....");
                let successful = true;
                let output = null;
                /* where to store raw output */
                let outputFile = null;
                try {
                    /* send the snippet for the java processor to handle; this has a possibility
                     * of throwing a timeout error, so catch and handle appropriately
                     */
                    output = jproc.repl(lines.slice(i + 1, lines.length - 1).join('\n'), {
                        timeout: commandOpts['timeout']
                    });
                    /* possible that snippet doesn't provide output, kinda weird though */
                    if (output == '' || output == null) {
                        logger_1.Logger.info("Snippet gave no output");
                        response.push("Didn't receive anything from the snippet :confused:");
                    }
                    else {
                        logger_1.Logger.info("Received snippet output");
                        /* replace CRLF with LF */
                        while (output.indexOf('\r\n') >= 0) {
                            output = output.replace('\r\n', '\n');
                        }
                        logger_1.Logger.debug("Generating filename to place raw output");
                        /* get time message was created at */
                        let date = msg.createdAt.toISOString();
                        /* make date file friendly */
                        while (date.indexOf(":") > -1) {
                            date = date.replace(":", "-");
                        }
                        outputFile = date + '.txt';
                        /* get new name for outputFile if current one already exists */
                        for (let i = 1; fs.existsSync(clientOpts.workspace + outputFile); i++) {
                            outputFile = date + util_1.format('(%d).txt', i);
                        }
                        logger_1.Logger.debug(util_1.format("Generated filename `%s` for raw output", clientOpts.workspace + outputFile));
                        fs.writeFileSync(clientOpts.workspace + outputFile, output);
                        /* wrap output in codeblocks
                         * preserve any new lines output may have; issue with wrapping output
                         * in codeblock is that it can escape prematurely if output contains
                         * sequences of 3 tildas (so discord interprets it in predictable,
                         * weird way); going to upload a file as a complement so other's can
                         * see the raw output (will be a text file) as done above.
                         */
                        logger_1.Logger.debug("Wrapping raw output in code-blocks for discord output");
                        output = '```\n' + output + '\n```';
                    }
                }
                catch (err) {
                    successful = false;
                    if (err instanceof RangeError) {
                        /* invalid timeout value */
                        logger_1.Logger.err(util_1.format("REPL - out of range timeout value (%d)", commandOpts['timeout']));
                        response.push('Whoops! ' + err.message + '!');
                    }
                    else {
                        if (err.code == "ETIMEDOUT") {
                            /* timed out */
                            logger_1.Logger.err("REPL - timed out");
                            response.push("Your snippet timed out :no_mouth:");
                        }
                        else {
                            /* some other unexpected error */
                            logger_1.Logger.err("Unexpected error");
                            logger_1.Logger.err(err);
                            response.push('Something went wrong');
                        }
                    }
                }
                if (successful && output != null) {
                    if (output.length > MAX_OUTPUT_PREVIEW_LEN) {
                        logger_1.Logger.info("Output was too big to print");
                        response.push("The output was quite large :eyes: so go ahead and look at "
                            + "the file I sent.");
                    }
                    else {
                        logger_1.Logger.info("Output was sent to text channel");
                        response.push("If the preview looks weird, you can always look at the "
                            + "file I sent.");
                        response.push(output);
                    }
                }
                msg.reply(output);
                if (successful && output) {
                    /* send output file */
                    logger_1.Logger.debug("Sending file containing raw output to text channel");
                    msg.channel.send("Raw Output:", {
                        file: clientOpts.workspace + outputFile,
                        name: outputFile
                    });
                }
                break;
            }
            case processor_1.JavaProcessor.FILE_COMP_CODE: {
                if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
                    /* user didn't provide a value for jdkCompiler */
                    logger_1.Logger.err(util_1.format("No value for jdkCompiler option [input: %s]", commandString));
                    response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
                    msg.reply(response);
                    break;
                }
                else if (commandOpts['file'] != null && typeof commandOpts['file'] == 'boolean') {
                    /* user didn't provide value for file */
                    logger_1.Logger.err(util_1.format("No value for file option [input: %s]", commandString));
                    response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
                    msg.reply(response);
                    break;
                }
                try {
                    /* compile string */
                    logger_1.Logger.info("Compiling Java file \"string\" input...");
                    msg.reply("Compiling the Java input...");
                    let output = jproc.compileString(lines.slice(i + 1, lines.length - 1).join('\n'), {
                        timeout: commandOpts['timeout'],
                        jdkCompiler: commandOpts['jdkCompiler'],
                        file: commandOpts['file']
                    });
                    /* javac outputs to stdout if and only if there were issues (warnings and errors
                     * are included) */
                    if (output != null) {
                        /* TODO store raw output into file, send file, print output in
                         * channel if it's not too big
                         */
                        logger_1.Logger.info("String input compilation failed");
                        response.push("You're Java file had some issues compiling:\n```\n"
                            + output + "\n```");
                    }
                    else {
                        logger_1.Logger.info("String input compilation successful");
                        response.push("Your Java file compiled successfully!");
                    }
                }
                catch (err) {
                    if (err instanceof RangeError) {
                        /* invalid timeout value */
                        logger_1.Logger.err(util_1.format("STR_COMP - out of range timeout value (%d)", commandOpts['timeout']));
                        response.push('Whoops! ' + err.message + '!');
                    }
                    else if (err instanceof errors_1.DependencyError) {
                        logger_1.Logger.err(util_1.format("STR_COMP - invalid jdk (%d)", commandOpts['jdkCompiler']));
                        response.push("Whoops! That's an invalid JDK!");
                    }
                    else if (err.code == 'ETIMEDOUT') {
                        /* timed out */
                        logger_1.Logger.err("STR_COMP - timed out");
                        response.push("Compilation timed out :no_mouth:");
                    }
                    else {
                        /* some other unexpected error */
                        logger_1.Logger.err("Unexpected error");
                        logger_1.Logger.err(err);
                        response.push('Something went wrong');
                    }
                }
                msg.reply(response);
                break;
            }
            default: {
                logger_1.Logger.warn(util_1.format("Unhandled status (%d)", status));
                msg.reply(response);
                break;
            }
        }
    }
    else {
        logger_1.Logger.info("No command found");
    }
    syncer.setInUse(false);
}
function processAttachments(msg, attachments) {
    if (attachments.size == 0) {
        logger_1.Logger.warn("No attachments, shouldn't even be here...");
        syncer.setInUse(false);
        return;
    }
    let response = [];
    let attachmentsArray = attachments.array();
    logger_1.Logger.debug("Processing each attachment");
    attachmentsArray.forEach((msgAttachment, index) => {
        /* if workspace folder doesn't exist, then create it */
        if (!fs.existsSync(clientOpts.workspace)) {
            try {
                logger_1.Logger.debug("Attempting to create workspace since it doesn't exist");
                mkdirp.sync(clientOpts.workspace);
            }
            catch (err) {
                /* bad if we couldn't create the workspace */
                logger_1.Logger.err(util_1.format("Couldn't create workspace (%s), skipping attachment id %d", clientOpts.workspace, msgAttachment.id));
                /* TODO handle this error */
                logger_1.Logger.err(err);
                response.push('There was an issue creating the workspace');
                msg.reply(response);
                /* don't continue on with this attachment */
                return;
            }
        }
        logger_1.Logger.info(util_1.format("Processing attachment id %d", msgAttachment.id));
        /* local filename */
        let file = clientOpts.workspace + msgAttachment.filename;
        logger_1.Logger.debug(util_1.format("Storing attachment into %s", file));
        /* TODO can we use WritableStream.on('finish', callback) to set
         * inUse to false (when appropriate)?
         */
        logger_1.Logger.debug("Downloading attachment...");
        /* downloading file */
        https.get(msgAttachment.url, resp => {
            resp.on('end', () => {
                logger_1.Logger.debug("Finished downloading attachment, now processing it");
                if (msg.content.startsWith('/comp') && msgAttachment.filename.endsWith('.java')) {
                    /* compiling a .java file */
                    /* TODO pattern matching for command */
                    /* strip command to just its arguments */
                    let commandString = msg.content.substring('/xxxx'.length).trimLeft();
                    /* split args */
                    let commandArgs = jid_utils_1.splitArgs(commandString);
                    /* parse args */
                    let commandOpts = minimist(commandArgs);
                    /* check if timeout option has value */
                    if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
                        logger_1.Logger.err(util_1.format("FILE_COMP - no value for timeout option [input %s]", commandString));
                        response.push('Whoops! You forgot to add a value for the `timeout` option!');
                    }
                    /* check if jdkCompiler option has value */
                    if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
                        logger_1.Logger.err(util_1.format("FILE_COMP - no value for jdkCompiler option [input %s]", commandString));
                        response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
                    }
                    logger_1.Logger.info("Compiling Java file...");
                    response.push("It's a Java file! Let me compile that real quick...");
                    try {
                        /* compile the file */
                        let output = jproc.compileFile(file, {
                            timeout: commandOpts['timeout'],
                            jdkCompiler: commandOpts['jdkCompiler']
                        });
                        /* same reasoning as with string compilation */
                        if (output != null) {
                            /* TODO store raw output into file, send file, print output in
                            * channel if it's not too big
                            */
                            logger_1.Logger.info("Java file compilation failed");
                            response.push("You're Java file had some issues compiling:\n```\n"
                                + output + "\n```");
                        }
                        else {
                            logger_1.Logger.info("Java file compilation successful");
                            response.push("You're Java file compiled successfully!");
                        }
                    }
                    catch (err) {
                        if (err instanceof RangeError) {
                            /* invalid timeout value */
                            logger_1.Logger.err(util_1.format("FILE_COMP - out of range timeout value (%d)", commandOpts['timeout']));
                            response.push('Whoops! ' + err.message + '!');
                        }
                        else if (err instanceof errors_1.DependencyError) {
                            logger_1.Logger.err(util_1.format("FILE_COMP - invalid jdk (%d)", commandOpts['jdkCompiler']));
                            response.push("Whoops! That's an invalid JDK!");
                        }
                        else if (err.code == 'ETIMEDOUT') {
                            /* timed out */
                            logger_1.Logger.err("FILE_COMP - timed out");
                            response.push("Compilation timed out :no_mouth:");
                        }
                        else {
                            logger_1.Logger.err("Unexpected error");
                            logger_1.Logger.err(err);
                            response.push('Something went wrong');
                        }
                    }
                    finally {
                        if (index == attachmentsArray.length - 1) {
                            /* no longer in use since we processed all files */
                            // inUse = false;
                        }
                    }
                }
                msg.reply(response);
            });
            /* pipe response (uploaded file's data) to a local write stream */
            logger_1.Logger.debug("Piping remote stream into local stream");
            resp.pipe(fs.createWriteStream(file));
        }).on('error', err => {
            logger_1.Logger.err("FILE_COMP - couldn't download file");
            logger_1.Logger.err(err);
            msg.reply('There was an issue receiving your file :frowning:\n'
                + '```\n' + err + '\n```');
            if (index == attachmentsArray.length - 1) {
                syncer.setInUse(false);
            }
        }).on('finish', () => {
            logger_1.Logger.info(util_1.format("Done with attachment id %d", msgAttachment.id));
            syncer.setInUse(false);
        });
    });
}
//# sourceMappingURL=discord_client.js.map