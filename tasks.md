# Tasks

## Keywords

|Keyword|Description|
|:-:|:-|
|BUG|A bug in the application|
|EXT|An extension/additional feature for the application|
|CLI|A command line interface extension|

## Work in Progress

Ordered from greatest to least priority/urgency:

- [ ] **[BUG]** Encapsulated file I/O
	- Prevent I/O operations that take place outside of a particular folder/workspace
- [ ] **[EXT]** Removing bot's last N messages
	- Should only remove from the channel command was called from
	- Helps remove clutter from a text channel
	- Could also have a setting to have bot speak in a dedicated text channel
- [ ] **[BUG]** Better synchronization for bot tasks (execute in a queue, 10 tasks max)
	- Allows for multiple users to make multiple calls at once, without having to wait for the current executing task to finish
- [ ] **[EXT]** Discord bot should notify text channels when a certain feature will not be available (i.e. JDK9 was not found, so compiling in Java 9 or REPL snippets will not work)
- [ ] **[BUG]** Properly handle errors
- [ ] **[CLI]** Log some detail depending on level, denoted by `--logging` or `-L`, and followed by one of the following values:
	- Errors (`--errors` or `-e`): errors
	- Warnings (`--warnings` or `-w`) [default]: warnings + errors
	- Info (`--info` or `-i`): info + warnings + errors
- [ ] **[CLI]** Configuration file for specifying JDKs
- [ ] **[BUG]** Print progress messages as they actually happen (not just in bulk with the rest of the bot's response)
- [ ] **[EXT]** Find JDK 8 and 9 on Linux
- [ ] **[EXT]** Expand support to JDK 10
- [ ] **[EXT]** Find JDKs on MacOS (very low priority)

## Completed

- [x] `[03/02/18]` **[EXT]** Programmatically find compiler and jshell paths (a.k.a. JDKs).
