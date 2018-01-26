"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream = require("stream");
/**
 * Initializes locally scoped field 'chars'.
 */
function initalizeChars() {
    let str = '';
    for (let i = 'a'.charCodeAt(0); i <= 'z'.charCodeAt(0); i++) {
        str += String.fromCharCode(i);
        str += String.fromCharCode(i).toUpperCase();
    }
    for (let i = 0; i < 10; i++) {
        str += i;
    }
    return str;
}
/**
 * Represents all possible random characters that can appear in
 * randString(number).
 */
exports.chars = initalizeChars();
/**
 * Generates a random string from possible characters in #chars
 *
 * @param length the length of the string (default: 10)
 * @see chars for the possible characters
 */
function randString(length = 10) {
    let str = '';
    for (let i = 0; i < length; i++) {
        let randChar = exports.chars.charAt(Math.floor(Math.random() * exports.chars.length));
        str += randChar;
    }
    return str;
}
exports.randString = randString;
/**
 * A stream that writes to a string object, which can be retrieved
 * via StringWriter#getData()
 */
class StringWriter extends stream.Writable {
    /**
     * Constructs a StringWriter, setting its output string to an empty string.
     */
    constructor() {
        super();
        /**
         * The string this Writer writes to.
         */
        this.data = '';
    }
    _write(chunk, encoding, callback) {
        this.data += Object(chunk).toString();
        callback(null);
    }
    /**
     * Gets the output string for this writer.
     */
    getData() {
        return this.data;
    }
}
exports.StringWriter = StringWriter;
/**
 * A stream that reads from a string object. Constructed by using
 * a string.
 */
class StringReader extends stream.Readable {
    /**
     * Constructs a StringReader from a string.
     * @param str the string to read from.
     */
    constructor(str) {
        super();
        /**
         * Index location of the string.
         */
        this.marker = 0;
        this.data = str;
    }
    _read(size) {
        if (this.marker >= this.data.length || size <= 0) {
            return null;
        }
        else {
            if (this.marker + size > this.data.length) {
                let chunk = String(this.data).substring(this.marker, this.data.length);
                this.marker += size;
                return chunk;
            }
            else {
                return String(this.data).substring(this.marker, this.marker += size);
            }
        }
    }
    /**
     * Retrieves the current marker position.
     */
    getMarker() {
        return this.marker;
    }
}
exports.StringReader = StringReader;
const wsChars = [
    '\u0009', '\u000a', '\u000b', '\u000c', '\u000d', '\u0020', '\u0085', '\u00a0',
    '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006',
    '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f',
    '\u3000', '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff'
];
/**
 * Removes all whitespace characters from a string.
 * Whitespace characters identified by
 * https://en.wikipedia.org/wiki/Whitespace_character#Unicode
 * @param str th string.
 * @returns the string with no whitespace characters.
 */
function removeWhitespace(str) {
    let nows = '';
    for (let i = 0; i < str.length; i++) {
        if (wsChars.indexOf(str.charAt(i)) < 0) {
            nows += str.charAt(i);
        }
    }
    return nows;
}
exports.removeWhitespace = removeWhitespace;
function splitArgs(str) {
    let args = str.split(' ');
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('"')) {
            args[i] = args[i].substring(1);
            // we're expecting a literal argument here, so add all the
            // arguments together (join with a space) when we reach
            // an argument that ends in a quote
            let j = i + 1;
            for (; j < args.length; j++) {
                if (args[j].endsWith('"')) {
                    args[j] = args[j].substring(0, args[j].length - 1);
                    break;
                }
            }
            args[i] += ' ' + args.splice(i + 1, j).join(' ');
        }
    }
    return args;
}
exports.splitArgs = splitArgs;
//# sourceMappingURL=utils.js.map