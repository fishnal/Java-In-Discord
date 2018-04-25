import { format } from "util";

export class Logger {
	public static readonly ERRORS: number = 0;
	public static readonly WARNINGS: number = 1;
	public static readonly INFO: number = 2;
	public static readonly DEBUG: number = 3;
	public static readonly NONE: number = Number.MAX_VALUE;

	private static readonly PREFIXES: string[] = [
		'ERROR',
		'WARN',
		'INFO',
		'DEBUG'
	];

	private static level: number = Logger.INFO;

	private static log(callLevel: number, printFunc: (msg?: any, ...params: any[]) => void, msg?: any) {
		if (Logger.level != Logger.NONE && Logger.level >= callLevel) {
			let formattedMsg: string = format('[%s]\t%s', Logger.PREFIXES[callLevel], msg);

			printFunc(formattedMsg);
		}
	}

	public static err(msg?: any) {
		Logger.log(Logger.ERRORS, console.error, msg);
	}

	public static warn(msg?: any) {
		Logger.log(Logger.WARNINGS, console.log, msg);
	}

	public static info(msg?: any) {
		Logger.log(Logger.INFO, console.log, msg);
	}

	public static debug(msg?: any) {
		Logger.log(Logger.DEBUG, console.log, msg);
	}

	public static setLevel(level: number): boolean {
		if (level != Logger.NONE && (level < Logger.ERRORS || level > Logger.DEBUG)) {
			return false;
		}

		Logger.level = level;

		return true;
	}
}
