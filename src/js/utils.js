"use strict";

const stream = require('stream');

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

/**
 * A stream that writes to a string object, which can be retrieved
 * via StringWriter#getData()
 */
class StringWriter extends stream.Writable {
	constructor() {
		super();
		this._data = '';
	}

	_write(chunk, encoding, callback) {
		this._data += Object(chunk).toString();

		callback(null);
	}

	/**
	 * Gets the output string for this writer.
	 */
	getData() {
		return this.data;
	}
}

/**
 * A stream that reads from a string object. Constructed by using
 * a string.
 */
class StringReader extends stream.Readable {
	constructor(str) {
		super();
		this._str = str;
		this._marker = 0;
	}

	_read(size) {
		if (size <= 0) {
			return null;
		} else {
			if (this._marker + size > this._str.length) {
				return String(this._str).substring(this._marker, this._str.length);
			} else {
				return String(this._str).substring(this._marker, this._marker += size);
			}
		}
	}

	/**
	 * Retrieves the current marker position.
	 */
	marker() {
		return this._marker;
	}
}

/**
 * Represents all possible random characters that can appear in
 * randString(number).
 */
exports.chars = initalizeChars();
exports.randString = randString;
exports.StringWriter = StringWriter;
exports.StringReader = StringReader;