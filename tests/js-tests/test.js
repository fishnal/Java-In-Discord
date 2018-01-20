var cp = require('child_process');

var a = cp.execFileSync('c:/program files/java/jdk-9/bin/jshell.exe', {
	timeout: 5000
});

console.log(a);