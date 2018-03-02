interface Options {}

/**
 * Timed options.
 */
export interface TimedOptions extends Options {
	/**
	 * Duration for timeout.
	 */
	timeout?: number;
}

/**
 * Options for compiling a file.
 */
export interface CompileOptions extends TimedOptions {
	/**
	 * JDK compiler version.
	 */
	jdkCompiler?: string;
}

/**
 * Options for compiling a string.
 */
export interface CompileStringOptions extends CompileOptions {
	/**
	 * File to compile string in.
	 */
	file?: string;
}

/**
 * Options for Discord Client.
 */
export interface ClientOptions extends Options {
	/**
	 * Where to place received files.
	 */
	workspace?: string;
	/**
	 * File that loads in other client options; overrides all other path options.
	 */
	config?: string;
	/**
	 * Path to jshell.
	 */
	jshell?: string;
	/**
	 * Path to javac 9.
	 */
	javac9?: string;
	/** 
	 * Path to javac 8.
	 */
	javac8?: string;
}

/**
 * Dependencies for a JavaProcessor.
 */
export interface Dependencies {
	/**
	 * Status code for which dependencies have not been found. 0 indicates everything was found.
	 */
	status: number;
	/**
	 * Path to jshell.
	 */
	jshell?: string;
	/** 
	 * Path to javac 9.
	 */
	javac9?: string;
	/**
	 * Path to javac 8.
	 */
	javac8?: string;
}

/**
 * Defaults some Options interface given a default implementation of
 * the same interface type. Only properties whose values are not defined
 * are defaulted.
 * 
 * @param opts the options provided.
 * @param defaults the default values.
 */
export function defaultOptions<T extends Options>(opts: T, defaults: T): void {
	for (let key in defaults) {
		if (opts[key] == null) {
			opts[key] = defaults[key];
		}
	}
}