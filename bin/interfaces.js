"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Defaults some Options interface given a default implementation of
 * the same interface type. Only properties whose values are not defined
 * are defaulted.
 *
 * @param opts the options provided.
 * @param defaults the default values.
 */
function defaultOptions(opts, defaults) {
    for (let key in defaults) {
        if (opts[key] == null) {
            opts[key] = defaults[key];
        }
    }
}
exports.defaultOptions = defaultOptions;
//# sourceMappingURL=interfaces.js.map