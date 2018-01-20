// test that exports from errors.ts works
// should be able to create new instances of all the errors
// and all error classes should be accessible via errors.*

import * as errors from '../../src/errors';

// verify empty constructors
new errors.TimeoutError();
new errors.AccessError();
new errors.FileAccessError();
new errors.WorkspaceAccessError();

// verify constructors w/string argument
new errors.TimeoutError('msg');
new errors.AccessError('msg');
new errors.FileAccessError('msg');
new errors.WorkspaceAccessError('msg');