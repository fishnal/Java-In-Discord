import * as commands from '../../src/commands';
import * as assert from 'assert';

var repl = commands.replCommand();
repl.parseOptions(['-t', '500']);
assert(repl.timeout == 500);
repl = commands.replCommand();
repl.parseOptions(['--timeout', '500']);
assert(repl.timeout == 500);

var file = commands.fileCompCommand();
file.parseOptions(['-t', '500']);
assert(file.timeout == 500);
file = commands.fileCompCommand();
file.parseOptions(['-j', 'jdk8']);
assert(file.jdkCompiler == 'jdk8');
file.parseOptions(['-t', '500']);
assert(file.timeout == 500);
file = commands.fileCompCommand();
file.parseOptions(['-t', '500', '-j', 'jdk8']);
assert(file.timeout == 500);
assert(file.jdkCompiler == 'jdk8');

var str = commands.stringCompCommand();
str.parseOptions(['-f', 'a.java']);
assert(str.file == 'a.java');