/**
 * Indicates that timeout limit was reached.
 */
export class TimeoutError extends Error {
	constructor(message?: string) {
		super(message);
		Object.setPrototypeOf(this, TimeoutError.prototype);
	}
}

/**
 * Indicates that an illegal access to something was attempted.
 */
export class AccessError extends Error {
	constructor(message?: string) {
		super(message);
		Object.setPrototypeOf(this, AccessError.prototype);
	}
}

/**
 * Indicates that an illegal file/folder access was attempted. 
 */
export class FileAccessError extends AccessError {
	constructor(message?: string) {
		super(message);
		Object.setPrototypeOf(this, FileAccessError.prototype);
	}
}

/**
 * Indicates that an illegal workspace access was attempted.
 * For example, User A attempts to access User B's workspace
 * without proper permission.
 */
export class WorkspaceAccessError extends AccessError {
	constructor(message?: string) {
		super(message);
		Object.setPrototypeOf(this, WorkspaceAccessError.prototype);
	}
}

/**
 * Indicates an invalid JDK or some issue with the dependencies.
 */
export class DependencyError extends Error {
	constructor(message?: string) {
		super(message);
		Object.setPrototypeOf(this, DependencyError.prototype);
	}
}