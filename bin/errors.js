"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Indicates that timeout limit was reached.
 */
class TimeoutError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}
exports.TimeoutError = TimeoutError;
/**
 * Indicates that an illegal access to something was attempted.
 */
class AccessError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, AccessError.prototype);
    }
}
exports.AccessError = AccessError;
/**
 * Indicates that an illegal file/folder access was attempted.
 */
class FileAccessError extends AccessError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, FileAccessError.prototype);
    }
}
exports.FileAccessError = FileAccessError;
/**
 * Indicates that an illegal workspace access was attempted.
 * For example, User A attempts to access User B's workspace
 * without proper permission.
 */
class WorkspaceAccessError extends AccessError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, WorkspaceAccessError.prototype);
    }
}
exports.WorkspaceAccessError = WorkspaceAccessError;
/**
 * Indicates an invalid JDK or some issue with the JDK.
 */
class JDKError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, JDKError.prototype);
    }
}
exports.JDKError = JDKError;
//# sourceMappingURL=errors.js.map