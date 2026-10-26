import fs from "node:fs";
import path from "node:path";
import { logDir } from "./paths.ts";

const rotateLogs = (): void => {
	const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
	for (const name of fs.readdirSync(logDir)) {
		try {
			if (fs.statSync(path.join(logDir, name)).mtimeMs < cutoff) {
				fs.unlinkSync(path.join(logDir, name));
			}
		}
		catch (e) {
		}
	}
};

let logFh: number;
export const logWrite = (line: string): void => {
	if (logFh === undefined) {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		const logfileName = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}Z.txt`;
		fs.mkdirSync(logDir, { recursive: true });
		logFh = fs.openSync(path.join(logDir, logfileName), "a", 0o600);
		rotateLogs();
	}
	fs.writeSync(logFh, line + "\n");
};
export const logWriteBoth = (line: string): void => {
	console.log(line);
	logWrite(line);
};
