import * as utils from './utils';
import * as pty from 'node-pty';
import { ITerminal } from "node-pty/lib/interfaces";
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as util from 'util';
import * as cp from 'child_process';
import { StringWriter } from "./utils";
import * as interfaces from "./interfaces";
import * as errors from './errors';

/**
 * Processes Java REPL scripts and compilations.
 */
export class JavaProcessor {
	/**
	 * Identifier for REPL.
	 */
	public static readonly REPL_CODE = 1;
	
	/**
	 * Identifier for file compilation.
	 */
	public static readonly FILE_COMP_CODE = 2;
	
	/**
	 * Identifier for string compilation.
	 */
	public static readonly STRING_COMP_CODE = 3;

	/**
	 * Minimum timeout duration.
	 */
	public static readonly MIN_TIMEOUT: number = 1000;

	/**
	 * Maximum timeout duration.
	 */
	public static readonly MAX_TIMEOUT: number = 20000;

	/**
	 * Supported JDKs.
	 */
	private static readonly supportedJDKs: {[jdk: string]: string} = {
		'jdk8':'c:/program files/java/jdk1.8.0_144/bin/javac.exe',
		'jdk9':'c:/program files/java/jdk-9/bin/javac.exe'
	}

	/**
	 * Returns a list of the supported JDKs.
	 * @returns list of supported JDKs.
	 */
	public static getSupportedJDKs(): string[] {
		let jdks: string[] = [];

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
	private static validateTimeout(timeout: number): void {
		if (!(timeout >= JavaProcessor.MIN_TIMEOUT && timeout <= JavaProcessor.MAX_TIMEOUT)) {
			throw new RangeError(
				util.format('Invalid timeout value (between %dms and %dms)',
				JavaProcessor.MIN_TIMEOUT, JavaProcessor.MAX_TIMEOUT)
			);
		}
	}

	/**
	 * Validates a JDK compiler choice by checking if it exists in
	 * JavaProcessor#supportedJDKs
	 * 
	 * @param jdkCompiler the JDK compiler choice. 
	 * @throws JDKError if the choice is not valid.
	 */
	private static validateJDKCompiler(jdkCompiler: string): void {
		if (!JavaProcessor.supportedJDKs[jdkCompiler]) {
			throw new errors.JDKError(util.format('valid JDK compilers: %O', JavaProcessor.supportedJDKs));
		}
	}

	/**
	 * Fixes a Java snippet line endings and the ending of the content.
	 * @param snippet the Java REPL snippet
	 * @returns the fixed Java snippet.
	 */
	private static fixSnippet(snippet: string): string {
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
	 * Constructs a JavaProcessor object.
	 */
	public constructor() {
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
	public repl(snippet: string, opts: interfaces.BasicOptions = {}, callback: (err: string, output: string) => void = (err, output) => {}): string {
		interfaces.defaultOptions(opts, {
			timeout:5000
		});

		JavaProcessor.validateTimeout(opts.timeout);

		snippet = JavaProcessor.fixSnippet(snippet);
		let jshFile = '$' + utils.randString() + '.jsh';
		fs.writeFileSync(jshFile, snippet);

		let outputPipe: StringWriter = new StringWriter();
	
		let jshell: string = 'C:/Program Files/Java/jdk-9/bin/jshell.exe';
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
	public compileString(compileString: string,  opts: interfaces.CompileStringOptions = {}): string {
		interfaces.defaultOptions(opts, {
			timeout: 5000,
			jdkCompiler: 'jdk8',
			file: '$' + utils.randString() + '.java',
		});

		JavaProcessor.validateTimeout(opts.timeout);
		JavaProcessor.validateJDKCompiler(opts.jdkCompiler);
		
		let compilerPath: string = JavaProcessor.supportedJDKs[opts.jdkCompiler];
		let outputPipe: StringWriter = new StringWriter();

		fs.writeFileSync(opts.file, compileString);

		try {
			let dir = 'jid_cache_' + utils.randString() + '/'
			fs.mkdirSync(dir);
			
			outputPipe.write(cp.spawnSync(compilerPath, ['-d', dir, opts.file], {
				cwd: process.cwd(),
				timeout: opts.timeout,
				encoding: 'utf8'
			}).stderr);

			fs.unlinkSync(opts.file);
			fse.removeSync(dir);
		} catch (err) {
			if (err.message.indexOf('TIMEDOUT') >= 0) {
				// execution timed out, record that
				outputPipe.write('execution timed out');
			} else {
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
	public compileFile(file: string, opts: interfaces.CompileOptions = {}): string {
		interfaces.defaultOptions(opts, {
			timeout: 5000,
			jdkCompiler: 'jdk8'
		});

		JavaProcessor.validateTimeout(opts.timeout);
		JavaProcessor.validateJDKCompiler(opts.jdkCompiler);
		
		let compilerPath: string = JavaProcessor.supportedJDKs[opts.jdkCompiler];
		let outputPipe: StringWriter = new StringWriter();

		try {
			let dir: string = 'jid_cache_' + utils.randString() + '/';
			fs.mkdirSync(dir);
			
			outputPipe.write(cp.spawnSync(compilerPath, ['-d', dir, file], {
				cwd: process.cwd(),
				timeout: opts.timeout,
				encoding: 'utf8'
			}).stderr);

			fse.removeSync(dir);
		} catch (err) {
			if (err.message.indexOf('TIMEDOUT') >= 0) {
				// execution timed out, record that
				outputPipe.write('execution timed out');
			} else {
				outputPipe.write(err.message);
			}
		}

		if (outputPipe.getData() == '') {
			return null;
		}

		return outputPipe.getData();
	}
}