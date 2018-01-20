### TODO List

- Finalize Java REPL processing
- Setup Java file compilation processing
	- Understand that 'file' compilation does NOT require a file to be inputted, instead a string can be passed through that represents the file's contents
	- Set of options present for compilation processing (do not confuse this with options for the compiler tool):
		- JDK version (currently 8 and 9 supported; 7 and below are purposefully excluded)
		- File name: may be necessary for certain compilations (for example when declaring a `public class`)
- Create workspaces
	- Isolate workspaces from environment (user's use it as the only drive/root folder they have access to)
	- User's do not have access to the internet (saves bandwidth)
	- Allow user's to grant other user's permissions to their workspace. Permissions include:
		- Read access to certain folders and files
		- *Monitored* Write access to certain folders and files
			- Changes must be approved by owner of workspace before they're pushed.
		- *Complete* Write access to certain folders and files
			- Changes do not need to be approved by owner of workspace before they're pushed (but can request for approval).
		- Grant same permissions given to this user to other user's
			- i.e. User A grants User B permission to read access and sharing permissions. User B can now provide other user's *only* read access to any other user. This is only possible if User B has sharing permissions.