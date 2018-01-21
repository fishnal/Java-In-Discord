/**
 * Basic options
 */
export interface BasicOptions {
	/**
	 * Duration for timeout.
	 */
	timeout?: number;
}

/**
 * Options for compiling a file.
 */
export interface CompileOptions extends BasicOptions {
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
 * Defaults some BasicOptions interface given a default implementation of
 * the same interface type. Only properties whose values are not defined
 * are defaulted.
 * 
 * @param opts the options provided.
 * @param defs the default values.
 */
export function defaultOptions<T extends BasicOptions>(opts: T, defs: T) {
	for (let key in defs) {
		if (opts[key] == null) {
			opts[key] = defs[key];
		}
	}
}