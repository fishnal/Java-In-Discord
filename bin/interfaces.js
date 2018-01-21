"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Defaults some BasicOptions interface given a default implementation of
 * the same interface type. Only properties whose values are not defined
 * are defaulted.
 *
 * @param opts the options provided.
 * @param defs the default values.
 */
function defaultOptions(opts, defs) {
    for (let key in defs) {
        if (opts[key] == null) {
            opts[key] = defs[key];
        }
    }
}
exports.defaultOptions = defaultOptions;
//# sourceMappingURL=interfaces.js.map