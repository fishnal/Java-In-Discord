import { Processor } from '../../src/processor';

var a: Processor = new Processor();
console.log(a.compileString('class A {} class B {} class C {}'));
console.log("==================================================");
console.log(a.compileFile('tests/java-examples/Foo.java'));
console.log("==================================================");
console.log(a.compileFile('tests/java-examples/FooBad.java'));
console.log("==================================================");
a.repl('2+3\n/exit\n', {timeout:20000}, (err, output) => {
	if (err) {
		console.log('ERROR');
		console.log('------');
		console.log(err);
		console.log('------');
	}
	console.log('OUTPUT');
	console.log(output);
});