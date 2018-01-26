# JID - Java Integration with Discord

- [Introduction](#intro)
- [OS Support](#os-support)
- [Features](#features)
	- [Java 9 REPL](#java-9-repl)
	- [JKD8 + file compilation via file upload](#filecomp)
	- [JDK8+ "string" compilation via text](#stringcomp)

### [Introduction](#intro)
JID strives to provide Java REPL functionality and basic Java compilation in a Discord server. This is possible by sending inputs to Java 9's `jshell` REPL tool and a JDK's `javac` compiler tool.

### [OS Support](#os-support)
Only tested on Windows, planning to test on a Linux environment. macOS is undecided.

### [Features](#features)
- [Java 9 REPL](#java-9-repl)
- [JDK8+ file compilation via file upload](#filecomp)
- [JDK8+ "string" compilation via text](#stringcomp)

#### [Java 9 REPL](#java-9-REPL)
Executing a Java script in the `jshell` environment would involve wrapping the script in a multiline code block like so:
````
```java
// repl [options]
<script>
```
````
##### Options
| Option | Description | Values |
| - | - | - |
| `timeout` | How long the execution is alive until it's forcibly terminated (in ms) | integer between 1000 and 20000 |

#### [JDK8+ File Compilation](#filecomp)
A file compilation uploads a `java` file to the server and compiles the file.
This is triggered whenever a user uploads a Java file and adds the `comp` command to the *optional* (I guess it's required now if you want to compile) comment of the attachment.
An example of the comment would be `/comp [options]`. If the command
is called when uploading a file that does not have the `.java` file extension, then the host machine just receives the file.
##### Options
| Option | Description | Values |
| - | - | - |
| `timeout` | How long the execution is alive until it's forcibly terminated (in ms) | `<integer>` between `1000` and `20000` |
| `jdkCompiler` | Which JDK compiler to use | `jdk8` \| `jdk9` |

#### [JDK8+ "String" Compilation](#stringcomp)
A "string" compilation is similar to a file compilation, except that the file's contents are the string. Compiling a "string" would look like so
````
```java
// comp [options]
<content>
```
````
One issue with this is that if the content is when a public class is declared and no file is specified to compile the contents in (see below code block). This results in the program compiling the contents in a randomly named `.java` file, making it highly improbable for a successful compilation.
````
```java
//comp
public class A {

}
```
````
To fix this, one would supply the command a `file` option and specify the file name to compile the contents in. So our command would look like `// comp -file A.java`
##### Options
| Option | Description | Values |
| - | - | - |
| `timeout` | How long the execution is alive until it's forcibly terminated (in ms) | `integer` between `1000` and `20000` |
| `jdkCompiler` | Which JDK compiler to use | `jdk8` \| `jdk9` |
| `file` | File name that the string should be compiled in (must end with `.java`) | `any string` |