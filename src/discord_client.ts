import { Client, Collection, MessageAttachment, Message, TextChannel } from 'discord.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as request from 'request';
import * as https from 'https';
import * as mkdirp from 'mkdirp';
import * as minimist from 'minimist';
import * as interfaces from './interfaces';
import { format } from 'util';
import { TimeoutError, DependencyError } from './errors';
import { JavaProcessor } from './processor';
import { removeWhitespace, splitArgs, findDeps } from './jid_utils';
import { Logger } from './logger';

/* TODO change logging level based on command line args */
Logger.setLevel(3); /* using debugging level */

/* max output length that bot will preview in the text channel
 * (includes any other characters bot needs to add)
 */
const MAX_OUTPUT_PREVIEW_LEN: number = 200;

/* get the command line args and parse them into options */
const cmdLineOpts: object = minimist(process.argv.slice(2));

/* input stream for reading in token */
let inputStream: NodeJS.ReadableStream = process.stdin;

/* check and validate token option */
if (cmdLineOpts['token']) {
	if (typeof cmdLineOpts['token'] == 'boolean') {
		Logger.warn("No value for 'token' option, using stdin");
	} else {
		Logger.info(format("Reading token from %s", cmdLineOpts['token']));
		let fileInput: fs.ReadStream = fs.createReadStream(cmdLineOpts['token']);
		inputStream = fileInput;
	}
}

/* used for reading in token of discord application */
let rl: readline.ReadLine = readline.createInterface({
	input: inputStream,
	output: process.stdout,
	terminal: false
});
/* used for processing java commands */
const jproc: JavaProcessor = new JavaProcessor();
/* the bot/discord client we're going to use for api calls */
const client: Client = new Client();

/* additional options user provided for the client to use */
Logger.debug("Processing options for client");
let clientOpts: interfaces.ClientOptions = processClientOpts(process.argv.slice(2));

/* make workspace directory if it doesn't exist */
if (!fs.existsSync(clientOpts.workspace)) {
	Logger.debug(format("Creating directory %s", clientOpts.workspace));
	fs.mkdirSync(clientOpts.workspace);
}

function processClientOpts(args: string[]): interfaces.ClientOptions {
	let opts: interfaces.ClientOptions = {};

	/* supported properties */
	let props: string[] = [ 'workspace', 'config', 'jshell', 'javac8', 'javac9' ];


	Logger.debug("Setting each client option property to equivalent provided command line option");
	/* for-each property, set opts[prop] to the parsed options of "--prop_name";
	 * not that if "--prop_name" is undefined in parsed options, then it is still
	 * added to our options, but we never look at it
	 */
	props.forEach(prop => {
		opts[prop] = cmdLineOpts['--' + prop];

		if (cmdLineOpts['--' + prop]) {
			Logger.debug(format("opts[%s] = %s", prop, cmdLineOpts['--' + prop]));
		}
	});

	/* dependencies for the java processor */
	Logger.debug("Getting dependencies");
	let deps: interfaces.Dependencies = findDeps();
	jproc.setDependencies(deps);

	/* default options for our client (these are overridden by user's options) */
	Logger.debug("Defaulting to client options (overridden by a config file if provided)");
	interfaces.defaultOptions(opts, {
		workspace: 'workspace/',
		config: undefined,
		jshell: opts.config ? undefined : deps['jshell'],
		javac9: opts.config ? undefined : deps['javac9'],
		javac8: opts.config ? undefined : deps['javac8']
	});

	/* add an ending slash to the workspace property if needed */
	if (!opts.workspace.endsWith('/') && !opts.workspace.endsWith('\\')) {
		Logger.debug("Appending a forward-slash to workspace path");
		opts.workspace += '/';
		Logger.debug(format("Workspace path is now %s", opts.workspace));
	}

	/* if user provides a JSON configuration file which identifies the dependencies
	 * for the java processor, then use that */
	if (opts.config) {
		Logger.info("Applying config file settings to client options");
		/* read in JSON config file */
		Logger.debug("Parsing JSON config file");
		let configData: any = JSON.parse(fs.readFileSync(opts.config).toString());

		/* assign config properties appropriately */
		opts.jshell = configData['jshell'];
		opts.javac9 = configData['javac9'];
		opts.javac8 = configData['javac8'];

		Logger.debug("Finished applying config file settings");
	}

	for (let key in opts) {
		Logger.debug(format('opts[%s] = %s', key, opts[key]));
	}

	/* if our status is non-zero, then something could go wrong
	 * for example, a jshell environment isn't properly provided, and when
	 * user tries to run a java snippet, it won't run b/c there's nothing
	 * that can run the snippet */
	if (deps.status) {
		Logger.warn(format("Configuration status code = %d", status));
	}

	return opts;
}

/* acquire token and login */
rl.question("Enter your Discord bot's token:\n", token => {
	client.login(token).then(fulfilled => {
		Logger.info('Successfully logged in');

		rl.close();
		rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: false
		});

		process.stdout.write('> ');

		rl.on('line', (line: string) => {
			if (line == 'quit' || line == 'disconnect' || line == 'exit') {
				client.channels.forEach(channel => {
					if (channel.type == 'text') {
						/* TODO why is this not being sent? */
						(channel as TextChannel).send('Disconnecting...');
					}
				});

				client.emit('disconnect');
			} else {
				process.stdout.write('> ');
			}
		});
	}).catch(err => {
		Logger.err('Failed to login!\n' + err);
		process.exit(1);
	});
});

/* log client's good to go */
client.on('ready', () => {
	Logger.info('Client ready!');
}).on('disconnect', (event: CloseEvent) => {
	Logger.info('Disconnecting....');
	process.exit(0);
});

/* poor way of preventing other messages from being processed at once. */
let syncer = new (class BadSynchronizer {
	private inUse: boolean = false;

	public setInUse(value: boolean): void {
		if (this.inUse != value) {
			if (this.inUse) {
				/* previously in use, now no longer in use */
				Logger.debug("Bot no longer in use");
			} else {
				Logger.debug("Bot is in use");
			}

			this.inUse = value;
		}
	}

	public getInUse(): boolean {
		return this.inUse;
	}
});

client.on('message', msg => {
	/* only work with messages that are not sent by this bot */
	if (msg.author != client.user) {
		if (syncer.getInUse()) {
			Logger.debug("Bot currently performing a task");
			msg.reply("I'm busy right now, try later.");
			return;
		}

		/* this should always be set to false at some point */
		syncer.setInUse(true);

		/* determine if user wants to execute a java-based command */
		let content: string = msg.content;

		if (content.startsWith('```java') && content.endsWith('```')) {
			Logger.debug("Processing java command");
			processJavaCommand(msg);
		} else if (msg.attachments.size > 0) {
			Logger.debug("Processing attachments");
			processAttachments(msg, msg.attachments);
		} else {
			syncer.setInUse(false);
		}
	}
});

function processJavaCommand(msg: Message): void {
	/* pattern for checking if command exists */
	const commandExpression: string = "\\s*\\/\\/\\s*";
	/* length of command */
	let commandLength: number;
	/* match result for the command */
	let match: RegExpMatchArray;
	/* response for bot */
	let response: string[] = [];
	/* lines for bot to parse/process */
	let lines: string[] = msg.content.split('\n');
	/* the kind of command we're dealing with */
	let status: number;

	Logger.debug("Finding java command in codeblock");
	let i: number = 1;
	for (; i < lines.length; i++) {
		/* `//repl` and `//comp` (and variations) should be the first non-whitespace line
		 * if we want to process these lines
		 */
		if (removeWhitespace(lines[i]).length != 0) {
			/* not an empty line after removing the whitespace */

			/* check if it's repl or comp and set status accordingly */
			if (match = lines[i].match(commandExpression + 'repl')) {
				status = JavaProcessor.REPL_CODE;
			} else if (match = lines[i].match(commandExpression + 'comp')) {
				status = JavaProcessor.FILE_COMP_CODE;
			}

			/* if we have a valid command, update commandLength */
			if (status) {
				commandLength = match[0].length;
			}

			Logger.debug(format("Found command \"%s\"", status == JavaProcessor.REPL_CODE ? 'repl' : 'comp'));
			break;
		}
	}

	/* do something with command if it exists, otherwise do nothing */
	if (status) {
		Logger.debug("Stripping arguments from command");
		/* strips command itself and leaves us with arguments for the command */
		let commandString: string = lines[i].substring(commandLength).trimLeft();
		/* split the arguments */
		let commandArgs: string[] = splitArgs(commandString);
		/* parse the arguments */
		let commandOpts: object = minimist(commandArgs);

		/* if user provides timeout option but doesn't specify what the value is, then bad */
		if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
			Logger.err(format("No value for timeout option [input: %s]", commandString));
			response.push('Whoops! You forgot to add a value for the `timeout` option!');
			status = undefined;
		}

		switch (status) {
			case JavaProcessor.REPL_CODE: {
				Logger.info("Running Java snippet...");
				msg.reply("Running your Java snippet....");

				let successful: boolean = true;
				let output: string = null;
				/* where to store raw output */
				let outputFile: string = null;

				try {
					/* send the snippet for the java processor to handle; this has a possibility
					 * of throwing a timeout error, so catch and handle appropriately
					 */
					output = jproc.repl(lines.slice(i+1, lines.length - 1).join('\n'), {
						timeout: commandOpts['timeout']
					});

					/* possible that snippet doesn't provide output, kinda weird though */
					if (output == '' || output == null) {
						Logger.info("Snippet gave no output");
						response.push("Didn't receive anything from the snippet :confused:");
					} else {
						Logger.info("Received snippet output");
						/* replace CRLF with LF */
						while (output.indexOf('\r\n') >= 0) {
							output = output.replace('\r\n', '\n');
						}

						Logger.debug("Generating filename to place raw output");
						/* get time message was created at */
						let date: string = msg.createdAt.toISOString();
						/* make date file friendly */
						while (date.indexOf(":") > -1) {
							date = date.replace(":", "-");
						}

						outputFile = date + '.txt';

						/* get new name for outputFile if current one already exists */
						for (let i = 1; fs.existsSync(clientOpts.workspace + outputFile); i++) {
							outputFile = date + format('(%d).txt', i);
						}

						Logger.debug(format("Generated filename `%s` for raw output", clientOpts.workspace + outputFile));
						fs.writeFileSync(clientOpts.workspace + outputFile, output);

						/* wrap output in codeblocks
						 * preserve any new lines output may have; issue with wrapping output
						 * in codeblock is that it can escape prematurely if output contains
						 * sequences of 3 tildas (so discord interprets it in predictable,
						 * weird way); going to upload a file as a complement so other's can
						 * see the raw output (will be a text file) as done above.
						 */
						Logger.debug("Wrapping raw output in code-blocks for discord output");
						output = '```\n' + output + '\n```';
					}
				} catch (err) {
					successful = false;

					if (err instanceof RangeError) {
						/* invalid timeout value */
						Logger.err(format("REPL - out of range timeout value (%d)", commandOpts['timeout']));
						response.push('Whoops! ' + err.message + '!');
					} else {
						if (err.code == "ETIMEDOUT") {
							/* timed out */
							Logger.err("REPL - timed out");
							response.push("Your snippet timed out :no_mouth:")
						} else {
							/* some other unexpected error */
							Logger.err("Unexpected error");
							Logger.err(err);
							response.push('Something went wrong');
						}
					}
				}

				if (successful && output != null) {
					/* send output file */
					Logger.debug("Sending file containing raw output to text channel");
					msg.channel.send("Here's your snippet output:", {
						file: clientOpts.workspace + outputFile,
						name: outputFile
					});

					if (output.length > MAX_OUTPUT_PREVIEW_LEN) {
						Logger.info("Output was too big to print");
						response.push("The output was quite large :eyes: so go ahead and look at"
						 + "the file I sent.");
					} else {
						Logger.info("Output was sent to text channel");
						response.push("If the preview looks weird, you can always look at the "
						+ "file I sent.");
						response.push(output);
					}
				}

				msg.reply();

				break;
			}
			case JavaProcessor.FILE_COMP_CODE: {
				if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
					/* user didn't provide a value for jdkCompiler */
					Logger.err(format("No value for jdkCompiler option [input: %s]", commandString));
					response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					msg.reply(response);
					break;
				} else if (commandOpts['file'] != null && typeof commandOpts['file'] == 'boolean') {
					/* user didn't provide value for file */
					Logger.err(format("No value for file option [input: %s]", commandString));
					response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					msg.reply(response);
					break;
				}

				try {
					/* compile string */
					Logger.info("Compiling Java file \"string\" input...");
					msg.reply("Compiling the Java input...");
					let output: string = jproc.compileString(lines.slice(i+1, lines.length - 1).join('\n'), {
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
						Logger.info("String input compilation failed");
						response.push("You're Java file had some issues compiling:\n```\n"
							+ output + "\n```");
					} else {
						Logger.info("String input compilation successful");
						response.push("Your Java file compiled successfully!");
					}
				} catch (err) {
					if (err instanceof RangeError) {
						/* invalid timeout value */
						Logger.err(format("STR_COMP - out of range timeout value (%d)", commandOpts['timeout']));
						response.push('Whoops! ' + err.message + '!');
					} else if (err instanceof DependencyError) {
						Logger.err(format("STR_COMP - invalid jdk (%d)", commandOpts['jdkCompiler']));
						response.push("Whoops! That's an invalid JDK!");
					} else if (err.code == 'ETIMEDOUT') {
						/* timed out */
						Logger.err("STR_COMP - timed out");
						response.push("Compilation timed out :no_mouth:");
					} else {
						/* some other unexpected error */
						Logger.err("Unexpected error");
						Logger.err(err);
						response.push('Something went wrong');
					}
				}

				msg.reply(response);
				break;
			}
			default: {
				Logger.warn(format("Unhandled status (%d)", status));
				msg.reply(response);
				break;
			}
		}
	} else {
		Logger.info("No command found");
	}

	syncer.setInUse(false);
}


function processAttachments(msg: Message, attachments: Collection<string, MessageAttachment>): void {
	if (attachments.size == 0) {
		Logger.warn("No attachments, shouldn't even be here...");
		syncer.setInUse(false);
		return;
	}

	let response: string[] = [];
	let attachmentsArray: MessageAttachment[] = attachments.array();

	Logger.debug("Processing each attachment");
	attachmentsArray.forEach((msgAttachment, index) => {
		/* if workspace folder doesn't exist, then create it */
		if (!fs.existsSync(clientOpts.workspace)) {
			try {
				Logger.debug("Attempting to create workspace since it doesn't exist");
				mkdirp.sync(clientOpts.workspace);
			} catch (err) {
				/* bad if we couldn't create the workspace */
				Logger.err(format("Couldn't create workspace (%s), skipping attachment id %d", clientOpts.workspace, msgAttachment.id));
				/* TODO handle this error */
				Logger.err(err);
				response.push('There was an issue creating the workspace');
				msg.reply(response);

				/* don't continue on with this attachment */
				return;
			}
		}

		Logger.info(format("Processing attachment id %d", msgAttachment.id));

		/* local filename */
		let file: string = clientOpts.workspace + msgAttachment.filename;
		Logger.debug(format("Storing attachment into %s", file));

		/* TODO can we use WritableStream.on('finish', callback) to set
		 * inUse to false (when appropriate)?
		 */
		Logger.debug("Downloading attachment...");
		/* downloading file */
		https.get(msgAttachment.url, resp => {
			resp.on('end', () => {
				Logger.debug("Finished downloading attachment, now processing it");
				if (msg.content.startsWith('/comp') && msgAttachment.filename.endsWith('.java')) {
					/* compiling a .java file */

					/* TODO pattern matching for command */
					/* strip command to just its arguments */
					let commandString: string = msg.content.substring('/xxxx'.length).trimLeft();
					/* split args */
					let commandArgs: string[] = splitArgs(commandString);
					/* parse args */
					let commandOpts: object = minimist(commandArgs);

					/* check if timeout option has value */
					if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
						Logger.err(format("FILE_COMP - no value for timeout option [input %s]", commandString));
						response.push('Whoops! You forgot to add a value for the `timeout` option!');
					}

					/* check if jdkCompiler option has value */
					if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
						Logger.err(format("FILE_COMP - no value for jdkCompiler option [input %s]", commandString));
						response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					}

					Logger.info("Compiling Java file...");
					response.push("It's a Java file! Let me compile that real quick...");

					try {
						/* compile the file */
						let output: string = jproc.compileFile(file, {
							timeout: commandOpts['timeout'],
							jdkCompiler: commandOpts['jdkCompiler']
						});

						/* same reasoning as with string compilation */
						if (output != null) {
							/* TODO store raw output into file, send file, print output in
							* channel if it's not too big
							*/
							Logger.info("Java file compilation failed");
							response.push("You're Java file had some issues compiling:\n```\n"
								+ output + "\n```");
						} else {
							Logger.info("Java file compilation successful");
							response.push("You're Java file compiled successfully!");
						}
					} catch (err) {
						if (err instanceof RangeError) {
							/* invalid timeout value */
							Logger.err(format("FILE_COMP - out of range timeout value (%d)", commandOpts['timeout']));
							response.push('Whoops! ' + err.message + '!');
						} else if (err instanceof DependencyError) {
							Logger.err(format("FILE_COMP - invalid jdk (%d)", commandOpts['jdkCompiler']));
							response.push("Whoops! That's an invalid JDK!");
						} else if (err.code == 'ETIMEDOUT') {
							/* timed out */
							Logger.err("FILE_COMP - timed out");
							response.push("Compilation timed out :no_mouth:");
						} else {
							Logger.err("Unexpected error");
							Logger.err(err);
							response.push('Something went wrong');
						}
					} finally {
						if (index == attachmentsArray.length - 1) {
							/* no longer in use since we processed all files */
							// inUse = false;
						}
					}
				}

				msg.reply(response);
			});

			/* pipe response (uploaded file's data) to a local write stream */
			Logger.debug("Piping remote stream into local stream");
			resp.pipe(fs.createWriteStream(file));
		}).on('error', err => {
			Logger.err("FILE_COMP - couldn't download file");
			Logger.err(err);
			msg.reply('There was an issue receiving your file :frowning:\n'
				+ '```\n' + err + '\n```');

			if (index == attachmentsArray.length - 1) {
				syncer.setInUse(false);
			}
		}).on('finish', () => {
			Logger.info(format("Done with attachment id %d", msgAttachment.id));
			syncer.setInUse(false);
		});
	});
}
