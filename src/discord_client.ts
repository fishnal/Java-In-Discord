import { Client, Collection, MessageAttachment, Message, TextChannel } from 'discord.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as request from 'request';
import * as https from 'https';
import * as mkdirp from 'mkdirp';
import * as minimist from 'minimist';
import * as interfaces from './interfaces';
import { TimeoutError, DependencyError } from './errors';
import { JavaProcessor } from './processor';
import { removeWhitespace, splitArgs, findDeps } from './utils';
import { format } from 'util';

/* max output length that bot will preview in the text channel
 * (includes any other characters bot needs to add)
 */
const MAX_OUTPUT_PREVIEW_LEN: number = 200;

const cmdLineOpts: object = minimist(process.argv.slice(2));

let inputStream: NodeJS.ReadableStream = process.stdin;

if (cmdLineOpts['token']) {
	if (typeof cmdLineOpts['token'] == 'boolean') {
		console.log("no value for 'token' option, using stdin");
	} else {
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
let clientOpts: interfaces.ClientOptions = processClientOpts(process.argv.slice(2));

/* make workspace directory if it doesn't exist */
if (!fs.existsSync(clientOpts.workspace)) {
	fs.mkdirSync(clientOpts.workspace);
}

function processClientOpts(args: string[]): interfaces.ClientOptions {
	let opts: interfaces.ClientOptions = {};

	/* supported properties */
	let props: string[] = [ 'workspace', 'config', 'jshell', 'javac8', 'javac9' ];

	/* for-each property, set opts[prop] to the parsed options of "--prop_name";
	 * not that if "--prop_name" is undefined in parsed options, then it is still
	 * added to our options, but we never look at it
	 */
	props.forEach(prop => {
		opts[prop] = cmdLineOpts['--' + prop];
	});

	/* dependencies for the java processor */
	let deps: interfaces.Dependencies = findDeps();
	jproc.setDependencies(deps);

	/* default options for our client (these are overridden by user's options) */
	interfaces.defaultOptions(opts, {
		workspace: 'workspace/',
		config: undefined,
		jshell: opts.config ? undefined : deps['jshell'],
		javac9: opts.config ? undefined : deps['javac9'],
		javac8: opts.config ? undefined : deps['javac8']
	});

	/* add an ending slash to the workspace property if needed */
	if (!opts['workspace'].endsWith('/') && !opts['workspace'].endsWith('\\')) {
		opts['workspace'] += '/';
	}

	/* if user provides a JSON configuration file which identifies the dependencies
	 * for the java processor, then use that */
	if (opts.config) {
		/* read in JSON config file */
		let configData: any = JSON.parse(fs.readFileSync(opts.config).toString());

		/* assign config properties appropriately */
		opts.jshell = configData['jshell'];
		opts.javac9 = configData['javac9'];
		opts.javac8 = configData['javac8'];
	}

	/* bit-based status code: see utils.findDeps for details */
	let status: number = 0;

	/* if our status is non-zero, then something could go wrong
	 * for example, a jshell environment isn't properly provided, and when
	 * user tries to run a java snippet, it won't run b/c there's nothing
	 * that can run the snippet */
	if (status) {
		console.error('WARN: configuration status code = ' + status);
	}

	return opts;
}

/* acquire token and login */
rl.question("Enter your Discord bot's token: ", token => {
	client.login(token).then(fulfilled => {
		console.log('Successfully logged in: ' + fulfilled);
	}).catch(err => {
		console.log('Failed to login!\n' + err);
		process.exit(1);
	});

	rl.close();
	rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});

	rl.on('line', (line: string) => {
		if (line == 'quit' || line == 'disconnect' || line == 'exit') {
			client.channels.forEach(channel => {
				if (channel.type == 'text') {
					/* TODO why is this not being sent? */
					(channel as TextChannel).send('Disconnecting...');
				}
			});

			client.emit('disconnect');
		}
	});
});

/* log client's good to go */
client.on('ready', () => {
	console.log('Client ready!');
}).on('disconnect', (event: CloseEvent) => {
	console.log('Disconnecting....');
	process.exit(0);
});

/* poor way of preventing other messages from being processed at once. */
let inUse: boolean = false;

client.on('message', msg => {
	/* only work with messages that are not sent by this bot */
	if (msg.author != client.user) {
		if (inUse) {
			msg.reply("I'm busy right now, try later.");
			return;
		}

		/* this should always be set to false at some point */
		inUse = true;

		/* determine if user wants to execute a java-based command */
		let content: string = msg.content;

		if (content.startsWith('```java') && content.endsWith('```')) {
			processJavaCommand(msg);
		} else if (content.trimLeft().startsWith('/cleanup')) {
			/* trim for argument */
			let lifetimeArg: string | string[] = content.trimLeft().substring(content.indexOf(' '));
			lifetimeArg = lifetimeArg.substring(1);
			let lifetimeNum: number = 0;

			if (lifetimeArg == 'all') {
				lifetimeNum = 0.001;
			} else {
				/* parse w:d:h:m:s */
				lifetimeArg = lifetimeArg.split(':');
				let secondConversions: number[] = [1, 60, 3600, 86400, 604800];
				/* 604800s in week, 86400s in day, 3600 in hour, 60 in minute */

				for (let i = 0; i < lifetimeArg.length; i++) {
					lifetimeNum += Number(lifetimeArg[i]) * secondConversions[lifetimeArg.length - i - 1];
				}
			}

			/* figure out how to delete bot's messsages in this text channel */

			inUse = false;
		} else {
			processAttachments(msg, msg.attachments);
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

			break;
		}
	}

	/* do something with command if it exists, otherwise do nothing */
	if (status) {
		/* strips command itself and leaves us with arguments for the command */
		let commandString: string = lines[i].substring(commandLength).trimLeft();
		/* split the arguments */
		let commandArgs: string[] = splitArgs(commandString);
		/* parse the arguments */
		let commandOpts: object = minimist(commandArgs);

		/* if user provides timeout option but doesn't specify what the value is, then bad */
		if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
			response.push('Whoops! You forgot to add a value for the `timeout` option!');
			status = undefined;
		}

		switch (status) {
			case JavaProcessor.REPL_CODE: {
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
						response.push("Didn't receive anything from the snippet :confused:");
					} else {
						/* replace CRLF with LF */
						while (output.indexOf('\r\n') >= 0) {
							output = output.replace('\r\n', '\n');
						}

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

						fs.writeFileSync(clientOpts.workspace + outputFile, output);

						/* wrap output in codeblocks
						 * preserve any new lines output may have; issue with wrapping output
						 * in codeblock is that it can escape prematurely if output contains
						 * sequences of 3 tildas (so discord interprets it in predictable,
						 * weird way); going to upload a file as a complement so other's can
						 * see the raw output (will be a text file) as done above.
						 */
						output = '```\n' + output + '\n```';
					}
				} catch (err) {
					successful = false;

					if (err instanceof RangeError) {
						/* invalid timeout value */
						response.push('Whoops! ' + err.message + '!');
					} else {
						if (err.code == "ETIMEDOUT") {
							/* timed out */
							response.push("Your snippet timed out :no_mouth:")
						} else {
							/* some other unexpected error */
							response.push('Something went wrong');
							console.log(err);
						}
					}
				}

				if (successful && output != null) {
					/* send output file */
					msg.channel.send("Here's your snippet output:", {
						file: clientOpts.workspace + outputFile,
						name: outputFile
					});

					if (output.length > MAX_OUTPUT_PREVIEW_LEN) {
						response.push("The output was quite large :eyes: so go ahead and look at"
						 + "the file I sent.");
					} else {
						response.push("If the preview looks weird, you can always look at the "
						+ "file I sent.");
						response.push(output);
					}
				}

				msg.reply(response.join('\n'));

				break;
			}
			case JavaProcessor.FILE_COMP_CODE: {
				if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
					/* user didn't provide a value for jdkCompiler */
					response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					msg.reply(response);
					break;
				} else if (commandOpts['file'] != null && typeof commandOpts['file'] == 'boolean') {
					/* user didn't provide value for file */
					response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					msg.reply(response);
					break;
				}

				try {
					/* compile string */
					let output: string = jproc.compileString(lines.slice(i+1, lines.length - 1).join('\n'), {
						timeout: commandOpts['timeout'],
						jdkCompiler: commandOpts['jdkCompiler'],
						file: commandOpts['file']
					});

					/* javac outputs to stdout if and only if there were issues (warnings and errors
					 * are included) */
					if (output != null) {
						response.push("You're Java file had some issues compiling:\n```\n"
							+ output + "\n```");
					} else {
						response.push("Your Java file compiled successfully!");
					}
				} catch (err) {
					if (err instanceof RangeError) {
						/* TODO what is this error? */
						response.push('Whoops! ' + err.message + '!');
					} else if (err instanceof DependencyError) {
						response.push("Whoops! That's an invalid JDK!");
					} else if (err.code == 'ETIMEDOUT') {
						/* timed out */
						response.push("Compilation timed out :no_mouth:");
					} else {
						/* some other unexpected error */
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

	inUse = false;
}


function processAttachments(msg: Message, attachments: Collection<string, MessageAttachment>): void {
	if (attachments.size == 0) {
		inUse = false;
		return;
	}

	let response: string[] = [];
	let attachmentsArray: MessageAttachment[] = attachments.array();

	attachmentsArray.forEach((msgAttachment, index) => {
		/* if workspace folder doesn't exist, then create it */
		if (!fs.existsSync(clientOpts.workspace)) {
			try {
				mkdirp.sync(clientOpts.workspace);
			} catch (err) {
				/* kinda bad if we couldn't create the workspace... */
				response.push('Hmm... There was an issue creating the workspace...');
				msg.reply(response);
				console.log(err);

				/* don't continue on with this attachment */
				return;
			}
		}

		/* local filename */
		let file: string = clientOpts.workspace + msgAttachment.filename;

		/* TODO can use WritableStream.on('finish', callback) to set
		 * inUse to false (when appropriate)? */
		/* downloading file */
		https.get(msgAttachment.url, resp => {
			resp.on('end', () => {
				if (response.length != 0) {
					/* TODO just push instead? */
					response[0] = 'Received your files!';
				} else {
					response.push('Received your file!');
				}

				if (msg.content.startsWith('/comp') && msgAttachment.filename.endsWith('.java')) {
					/* compiling a .java file */

					/* strip command to just its arguments */
					let commandString: string = msg.content.substring('/xxxx'.length).trimLeft();
					/* split args */
					let commandArgs: string[] = splitArgs(commandString);
					/* parse args */
					let commandOpts: object = minimist(commandArgs);

					/* check if timeout option has value */
					if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
						response.push('Whoops! You forgot to add a value for the `timeout` option!');
					}

					/* check if jdkCompiler option has value */
					if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
						response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					}

					response.push("It's a Java file! Let me compile that real quick...");

					try {
						/* compile the file */
						let output: string = jproc.compileFile(file, {
							timeout: commandOpts['timeout'],
							jdkCompiler: commandOpts['jdkCompiler']
						});

						/* same reasoning as with string compilation */
						if (output == null) {
							response.push("You're Java file compiled successfully!");
						} else {
							response.push("You're Java file had some issues compiling:\n```\n"
								+ output + "\n```");
						}
					} catch (err) {
						if (err instanceof RangeError) {
							response.push('Whoops! ' + err.message + '!');
						} else if (err instanceof DependencyError) {
							response.push("Whoops! That's an invalid JDK!");
						} else if (err.code == 'ETIMEDOUT') {
							/* timed out */
							response.push("Compilation timed out :no_mouth:");
						} else {
							response.push('Something went wrong');
							console.log(err);
						}
					} finally {
						if (index == attachmentsArray.length - 1) {
							/* no longer in use since we processed all files */
							inUse = false;
						}
					}
				}

				msg.reply(response);
			});

			/* pipe response (uploaded file's data) to a local write stream */
			resp.pipe(fs.createWriteStream(file));
		}).on('error', err => {
			msg.reply('There was an issue receiving your file :frowning:\n'
				+ '```\n' + err + '\n```');

			if (index == attachmentsArray.length - 1) {
				inUse = false;
			}
		});
	});
}
