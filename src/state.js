import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { configDir } from "./paths.js";

export const state = fs.existsSync(path.join(configDir, "state.json")) ? JSON.parse(fs.readFileSync(path.join(configDir, "state.json"), "utf8")) : {};
const nullProto = (obj) => Object.assign(Object.create(null), obj);
state.profiles = nullProto(state.profiles);
state.apiKeys = nullProto(state.apiKeys);
state.providerStates = nullProto(state.providerStates);

export const promptForApiKey = async (provider) => {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	try {
		state.apiKeys[provider] = (await readline.question("Enter your API key: ")).trim();
	}
	finally {
		readline.close();
	}
};

export const saveState = () => {
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, "state.json"), JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
};

export const profileToString = (profile) => {
	return profile.provider.startsWith("http") ? `${profile.model} via ${profile.provider}` : `${profile.provider}/${profile.model}`;
};
