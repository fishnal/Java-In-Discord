import { Client, Collection, MessageAttachment, Message } from 'discord.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as request from 'request';
import * as https from 'https';
import * as mkdirp from 'mkdirp';
import * as minimist from 'minimist';
import * as interfaces from './interfaces';
import { TimeoutError, DependencyError } from './errors';
import { JavaProcessor } from './processor';
import { removeWhitespace, splitArgs, findDeps, SortedSet } from './utils';
import { POINT_CONVERSION_UNCOMPRESSED } from 'constants';

/* used for reading in token of discord application */
const rl: readline.ReadLine = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false
});
/* used for processing java commands */
const jproc: JavaProcessor = new JavaProcessor();
/* the bot/discord client we're going to use for api calls */
const client: Client = new Client();

/* additional options user provided for the client to use */
let clientOpts: interfaces.ClientOptions = processClientOpts(process.argv.slice(2));

function processClientOpts(args: string[]): interfaces.ClientOptions {
	let opts: interfaces.ClientOptions = {};
	let parsedOpts: object = minimist(args);

	/* supported properties */
	let props: string[] = [ 'workspace', 'config', 'jshell', 'javac8', 'javac9' ];

	/* for-each property, set opts[prop] to the parsed options of "--prop_name";
	 * not that if "--prop_name" is undefined in parsed options, then it is still
	 * added to our options, but we never look at it
	 */
	props.forEach(prop => {
		opts[prop] = parsedOpts['--' + prop];
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
		console.log('successfully logged in: ' + fulfilled);
	}).catch(err => {
		console.log('failed to login: ' + err);
	});
});

/* log client's good to go */
client.on('ready', () => {
	console.log('Client ready!');
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
		if (msg.content.startsWith('```java') && msg.content.endsWith('```')) {
			processJavaCommand(msg);
		} else {
			let attachments: Collection<string, MessageAttachment> = msg.attachments;
			processAttachments(msg, attachments);
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
		if (commandOpts['--timeout'] != null && typeof commandOpts['--timeout'] == 'boolean') {
			response.push('Whoops! You forgot to add a value for the `timeout` option!');
			status = undefined;
		}

		switch (status) {
			case JavaProcessor.REPL_CODE: {
				msg.reply("Running your Java snippet....");

				try {
					/* send the snippet for the java processor to handle; this has a possibility
					 * of throwing a timeout error, so catch and handle appropriately
					 */
					let output: string = jproc.repl(lines.slice(i+1, lines.length - 1).join('\n'), {
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

						/* TODO: dealing with snippet printing out tildas
						 * Bad solution: it's a feature, not a bug
						 * Solution A: performance over space
						 *    Find all possible sequential tildas (greater tha 3) in every line.
						 *    For example, if the output (as a whole) has sequential tildas of
						 *    2, 3, 4, and 6, then we should wrap the output in 7 tildas
						 *    (note that even though Discord doesn't EASILY let you use 1 or 2
						 *    tildas for code-blocks, it is 100% possible).
						 *
						 *    Benefit over solution B is that we don't have to spend time finding
						 *    the smallest tilda sequence that won't conflict with the original
						 *    output. Con is that it takes up more space.
						 * Solution B: space over performance
						 *    The better solution, but instead of just doing 1 + the largest
						 *    tilda sequence, we can find the smallest possible sequence by
						 *    searching through our sequence sizes, and finding the smallest
						 *    possible sequence that can be newly inserted into our sequence sizes
						 *    (this array is sorted). In the scenario above, that would be
						 *    a sequence of 1 tildas.
						 *
						 *    Benefit and con compared to solution A is the exact opposite.
						 *    Could optimize searching time for tilda sequence as we find our
						 *    sequence sizes (as the lines are pruned through). This gets rid of
						 *    an iteration over the sequence sizes.
						 *
						 * 	  We're going to put this in the utils.ts file, because we can make
						 *    use of this idea elsewhere in the application.
						 */

						/* kinda hoping that user doesn't print out 3 tildas;
						 * that can be interpreted as a code-block from Markdown,
						 * so that'll mess with the output format
						 */
						if (!output.startsWith('```\n')) {
							output = '```\n' + output;
						}

						/* add a new line if needed */
						if (!output.endsWith('\n')) {
							output += '\n';
						}

						output += '```';

						response.push("Here's your snippet output:");
						response.push(output);
					}
				} catch (err) {
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

				msg.reply(response);

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
