### TODO List

- Programmatically find compiler and jshell paths
	- Spit out errors if jshell was not found on host machine (Discord bot can say
	something like it's not available right now)
- Allow for user to change compiler/jshell paths via
	- Configuration file
	- Command line arguments
	- **DISCORD BOT USAGE:** users on a Discord guild/server cannot modify these paths, only the host machine of the bot can when executing `discord_client.ts` (or `discord_client.js` if host is not utilizing [`ts-node`](https://github.com/TypeStrong/ts-node))