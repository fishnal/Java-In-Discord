"use strict";

/**
 * Indicates that timeout limit was reached.
 */
class TimeoutError extends Error {
    constructor(message) {
        super(message);
    }
}

/**
 * Indicates that an illegal access to something was attempted.
 */
class AccessError extends Error {
    constructor(message) {
        super(message);
    }
}

/**
 * Indicates that an illegal file/folder access was attempted.
 */
class FileAccessError extends AccessError {
    constructor(message) {
        super(message);
    }
}

/**
 * Indicates that an illegal workspace access was attempted.
 * For example, User A attempts to access User B's workspace
 * without proper permission.
 */
class WorkspaceAccessError extends AccessError {
    constructor(message) {
        super(message);
    }
}

/**
 * Indicates an invalid JDK or some issue with the JDK.
 */
class JDKError extends Error {
    constructor(message) {
        super(message);
    }
}

exports.TimeoutError = TimeoutError;
exports.AccessError = AccessError;
exports.FileAccessError = FileAccessError;
exports.WorkspaceAccessError = WorkspaceAccessError;
exports.JDKError = JDKError;
