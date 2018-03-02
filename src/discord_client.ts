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
import { removeWhitespace, splitArgs, findDeps } from './utils';

const rl: readline.ReadLine = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	terminal: false
});
const jproc: JavaProcessor = new JavaProcessor();
const client: Client = new Client();

let clientOpts: interfaces.ClientOptions = processClientOpts(process.argv.slice(2));

function processClientOpts(args: string[]): interfaces.ClientOptions {
	let opts: interfaces.ClientOptions = {};
	let parsedOpts: object = minimist(args);

	let props: string[] = [ 'workspace', 'config', 'jshell', 'javac8', 'javac9' ];

	props.forEach(prop => {
		opts[prop] = parsedOpts['--' + prop];
	});

	let deps: interfaces.Dependencies = findDeps();
	jproc.setDependencies(deps);

	interfaces.defaultOptions(opts, {
		workspace: 'workspace/',
		config: undefined,
		jshell: opts.config ? undefined : deps['jshell'],
		javac9: opts.config ? undefined : deps['javac9'],
		javac8: opts.config ? undefined : deps['javac8']
	});

	if (!opts['workspace'].endsWith('/') && !opts['workspace'].endsWith('\\')) {
		opts['workspace'] += '/';
	}

	if (opts.config) {
		/* read in JSON config file */
		let configData: any = JSON.parse(fs.readFileSync(opts.config).toString());
		
		opts.jshell = configData['jshell'];
		opts.javac9 = configData['javac9'];
		opts.javac8 = configData['javac8'];
	}

	/* bit-based status code: see utils.findDeps for details */
	let status: number = 0;

	if (status) {
		console.error('WARN: configuration status code = ' + status);
	}

	return opts;
}

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

/* poor way of preventing other messages from being processed at once. */
let inUse: boolean = false;

client.on('message', msg => {
	/* only work with messages that are not sent by this bot */
	if (msg.author != client.user) {
		if (inUse) {
			msg.reply("I'm busy right now, try later.");
			return;
		}

		inUse = true;
		let response: string[] = [];

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
	let response: string[] = [];

	let lines: string[] = msg.content.split('\n');
	let status: number;

	let i: number = 1;
	for (; i < lines.length; i++) {
		if (removeWhitespace(lines[i]).length != 0) {
			if (lines[i].startsWith('// repl')) {
				status = JavaProcessor.REPL_CODE;
			} else if (lines[i].startsWith('// comp')) {
				status = JavaProcessor.FILE_COMP_CODE;
			}

			break;
		}
	}

	if (status) {
		let commandString: string = lines[i].substring('// xxxx'.length).trimLeft();
		let commandArgs: string[] = splitArgs(commandString);
		let commandOpts: object = minimist(commandArgs);

		if (commandOpts['--timeout'] != null && typeof commandOpts['--timeout'] == 'boolean') {
			response.push('Whoops! You forgot to add a value for the `timeout` option!');
			status = undefined;
		}
		
		switch (status) {
			case JavaProcessor.REPL_CODE: {
				msg.reply("Running your Java snippet....");
				
				try {
					let output: string = jproc.repl(lines.slice(i+1, lines.length - 1).join('\n'), {
						timeout: commandOpts['timeout']
					});

					if (output == '' || output == null) {
						response.push("Didn't receive anything from the snippet :confused:");
					} else {
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
				} catch (err) {
					if (err instanceof RangeError) {
						/* invalid timeout value */
						response.push('Whoops! ' + err.message + '!');
					} else {
						response.push('Something went wrong');
						console.log(err);
					}
				}

				msg.reply(response);

				break;
			}
			case JavaProcessor.FILE_COMP_CODE: {
				if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
					response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					msg.reply(response);
					break;
				} else if (commandOpts['file'] != null && typeof commandOpts['file'] == 'boolean') {
					response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					msg.reply(response);
					break;
				}

				try {
					let output: string = jproc.compileString(lines.slice(i+1, lines.length - 1).join('\n'), {
						timeout: commandOpts['timeout'],
						jdkCompiler: commandOpts['jdkCompiler'],
						file: commandOpts['file']
					});

					if (output != null) {
						response.push("Your Java file didn't compile properly! Here's the log:");
						response.push(output);
					} else {
						response.push("Your Java file compiled successfully!");
					}
				} catch (err) {
					if (err instanceof RangeError) {
						response.push('Whoops! ' + err.message + '!');
					} else if (err instanceof DependencyError) {
						response.push("Whoops! That's an invalid JDK!");
					} else {
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
	let response: string[] = [];
	
	attachments.forEach((v, k, m) => {
		if (!fs.existsSync(clientOpts.workspace)) {
			try {
				mkdirp.sync(clientOpts.workspace);
			} catch (err) {
				response.push('Hmm... There was an issue creating the workspace...');
				msg.reply(response);
				console.log(err);
			}
		}

		let file: string = clientOpts.workspace + v.filename;

		https.get(v.url, resp => {
			resp.on('end', () => {
				if (response.length != 0) {
					response[0] = 'Received your files!';
				} else {
					response.push('Received your file!');
				}

				if (msg.content.startsWith('/comp') && v.filename.endsWith('.java')) {
					let commandString: string = msg.content.substring('/xxxx'.length).trimLeft();
					let commandArgs: string[] = splitArgs(commandString);
					let commandOpts: object = minimist(commandArgs);

					if (commandOpts['timeout'] != null && typeof commandOpts['timeout'] == 'boolean') {
						response.push('Whoops! You forgot to add a value for the `timeout` option!');
					}

					if (commandOpts['jdkCompiler'] != null && typeof commandOpts['jdkCompiler'] == 'boolean') {
						response.push('Whoops! You forgot to add a value for the `jdkCompiler` option!');
					}

					response.push("It's a Java file! Let me compile that real quick...");

					try {
						let output: string = jproc.compileFile(file, {
							timeout: commandOpts['timeout'],
							jdkCompiler: commandOpts['jdkCompiler']
						});
						
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
						} else {
							response.push('Something went wrong');
							console.log(err);
						}
					}
				}

				msg.reply(response);
				inUse = false;
			});

			resp.pipe(fs.createWriteStream(file));
		}).on('error', err => {
			msg.reply('There was an issue receiving your file :frowning:\n'
				+ '```\n' + err + '\n```');
			inUse = false;
		});
	});
}