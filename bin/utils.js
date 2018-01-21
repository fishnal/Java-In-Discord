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
function defaultOptions(opts) {
}
exports.defaultOptions = defaultOptions;
//# sourceMappingURL=utils.js.map