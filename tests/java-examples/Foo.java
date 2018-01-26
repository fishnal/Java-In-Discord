// for use with file compilation

public class Foo {
	int a;
	
	public void foo() {
		a++;
	}

	public static void main(String[] args) {
		Foo obj = new Foo();
		
		System.out.println(obj.a);
		obj.foo();
		System.out.println(obj.a);
	}
}

class Bar {
	int b;

	public void bar() {
		b++;
	}
}