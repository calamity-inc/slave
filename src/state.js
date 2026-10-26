"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createInterface } = require("node:readline/promises");
const { configDir } = require("./paths.js");

const state = fs.existsSync(path.join(configDir, "state.json")) ? JSON.parse(fs.readFileSync(path.join(configDir, "state.json"), "utf8")) : {};
const nullProto = (obj) => Object.assign(Object.create(null), obj);
state.profiles = nullProto(state.profiles);
state.apiKeys = nullProto(state.apiKeys);
state.providerStates = nullProto(state.providerStates);

const promptForApiKey = async (provider) => {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	try {
		state.apiKeys[provider] = (await readline.question("Enter your API key: ")).trim();
	}
	finally {
		readline.close();
	}
};

const saveState = () => {
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, "state.json"), JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
};

const profileToString = (profile) => {
	return profile.provider.startsWith("http") ? `${profile.model} via ${profile.provider}` : `${profile.provider}/${profile.model}`;
};

module.exports = { state, promptForApiKey, saveState, profileToString };
