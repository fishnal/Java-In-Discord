"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
class Logger {
    static log(callLevel, printFunc, msg) {
        if (Logger.level != Logger.NONE && Logger.level >= callLevel) {
            let formattedMsg = util_1.format('[%s]\t%s', Logger.PREFIXES[callLevel], msg);
            printFunc(formattedMsg);
        }
    }
    static err(msg) {
        Logger.log(Logger.ERRORS, console.error, msg);
    }
    static warn(msg) {
        Logger.log(Logger.WARNINGS, console.log, msg);
    }
    static info(msg) {
        Logger.log(Logger.INFO, console.log, msg);
    }
    static debug(msg) {
        Logger.log(Logger.DEBUG, console.log, msg);
    }
    static setLevel(level) {
        if (level != Logger.NONE && (level < Logger.ERRORS || level > Logger.DEBUG)) {
            return false;
        }
        Logger.level = level;
        return true;
    }
}
Logger.ERRORS = 0;
Logger.WARNINGS = 1;
Logger.INFO = 2;
Logger.DEBUG = 3;
Logger.NONE = Number.MAX_VALUE;
Logger.PREFIXES = [
    'ERROR',
    'WARN',
    'INFO',
    'DEBUG'
];
Logger.level = Logger.INFO;
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map