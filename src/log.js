"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { logDir } = require("./paths.js");

const rotateLogs = () => {
	const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
	for (const name of fs.readdirSync(logDir)) {
		try {
			if (fs.statSync(path.join(logDir, name)).mtimeMs < cutoff) {
				fs.unlinkSync(path.join(logDir, name));
			}
		}
		catch (e) {
			// another process may have removed it already; ignore.
		}
	}
};

let logFh;
const logWrite = (line) => {
	if (!logFh) {
		const now = new Date();
		const pad = (n) => String(n).padStart(2, '0');
		const logfileName = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}Z.txt`;
		fs.mkdirSync(logDir, { recursive: true });
		logFh = fs.openSync(path.join(logDir, logfileName), "a", 0o600);
		rotateLogs();
	}
	fs.writeSync(logFh, line + "\n");
};
const logWriteBoth = (line) => {
	console.log(line);
	logWrite(line);
};

module.exports = { logWrite, logWriteBoth };
