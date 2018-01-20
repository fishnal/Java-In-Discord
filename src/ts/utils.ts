import * as stream from 'stream';

/**
 * Initializes locally scoped field 'chars'.
 */
function initalizeChars(): string {
	let str: string = '';
	
	for (let i: number = 'a'.charCodeAt(0); i <= 'z'.charCodeAt(0); i++) {
		str += String.fromCharCode(i);
		str += String.fromCharCode(i).toUpperCase();
	}

	for (let i: number = 0; i < 10; i++) {
		str += i;
	}

	return str;
}

/**
 * Represents all possible random characters that can appear in
 * randString(number).
 */
export const chars: string = initalizeChars();

/**
 * Generates a random string from possible characters in #chars
 * 
 * @param length the length of the string (default: 10)
 * @see chars for the possible characters
 */
export function randString(length: number = 10) {
	let str: string = '';

	for (let i: number = 0; i < length; i++) {
		let randChar = chars.charAt(Math.floor(Math.random() * chars.length));
		str += randChar;
	}

	return str;
}

/**
 * A stream that writes to a string object, which can be retrieved
 * via StringWriter#getData()
 */
export class StringWriter extends stream.Writable {
	private data: string = '';


	/**
	 * Constructs a StringWriter, setting its output string to an empty string.
	 */
	public constructor() {
		super();
	}

	public _write(chunk, encoding, callback) {
		this.data += Object(chunk).toString();

		callback(null);
	}

	/**
	 * Gets the output string for this writer.
	 */
	public getData() {
		return this.data;
	}
}

/**
 * A stream that reads from a string object. Constructed by using
 * a string.
 */
export class StringReader extends stream.Readable {
	/**
	 * String to read from.
	 */
	private data: string;

	/**
	 * Index location of the string.
	 */
	private marker: number = 0;

	/**
	 * Constructs a StringReader from a string.
	 * @param str the string to read from.
	 */
	public constructor(str: string) {
		super();
		this.data = str;
	}

	_read(size) {
		if (this.marker >= this.data.length || size <= 0) {
			return null;
		} else {
			if (this.marker + size > this.data.length) {
				let chunk: string = String(this.data).substring(this.marker, this.data.length);
				this.marker += size;
				return chunk;
			} else {
				return String(this.data).substring(this.marker, this.marker += size);
			}
		}
	}

	/**
	 * Retrieves the current marker position.
	 */
	public getMarker(): number {
		return this.marker;
	}
}