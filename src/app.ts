import * as express from 'express'
import * as minimist from 'minimist'
import * as fs from 'fs';
import * as JIDBot from './discord_client'

const PORT = process.env.PORT || 5000
const app = express();

app.listen(PORT, () => {
	console.log(`Listening on ${ PORT }`);
	console.log(`Executing discord_client`);
	/* read token in from file (cmd line arg) */
	let cmdLineOpts = minimist(process.argv.slice(2));
	let token: string;

	if (cmdLineOpts['token']) {
		token = fs.readFileSync(cmdLineOpts['token']).toString();
	}

	JIDBot.start(token);
});
