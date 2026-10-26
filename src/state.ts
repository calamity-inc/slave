import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { configDir } from "./paths.ts";

interface IProfile {
	provider: string;
	model: string;
}

interface IProviderState {
	previous?: string;
	previous_previous?: string;
	sandbox_name?: string;
}

interface IState {
	profiles: Record<string, IProfile>;
	apiKeys: Record<string, string>;
	providerStates: Record<string, IProviderState>;
	defaultProfile?: string;
	systemPrompt?: string;
}

export const state: IState = fs.existsSync(path.join(configDir, "state.json")) ? JSON.parse(fs.readFileSync(path.join(configDir, "state.json"), "utf8")) : {};
const nullProto = <T extends object>(obj: object): T => Object.assign(Object.create(null), obj);
state.profiles = nullProto(state.profiles);
state.apiKeys = nullProto(state.apiKeys);
state.providerStates = nullProto(state.providerStates);

export const promptForApiKey = async (provider: string): Promise<void> => {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	try {
		state.apiKeys[provider] = (await readline.question("Enter your API key: ")).trim();
	}
	finally {
		readline.close();
	}
};

export const saveState = (): void => {
	fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(path.join(configDir, "state.json"), JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
};

export const profileToString = (profile: IProfile): string => {
	return profile.provider.startsWith("http") ? `${profile.model} via ${profile.provider}` : `${profile.provider}/${profile.model}`;
};
