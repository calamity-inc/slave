#!/usr/bin/env node
"use strict";

async function main() {
	const { Command } = require("commander");

	const program = new Command();
	program
		.name("slave")
		.usage("[options] [--] [prompt...]")
		.description("Vibe coding without the kaboom factor.")
		.argument("[prompt...]")
		.option("-c, --continue", "add your previous invocation to the context of this one").option("--cont")
		.option("-a, --amend", "retry the previous invocation, using the context from before it")
		.option("-w, --web", "allow the model to search the web")
		.option("-n, --no-fs", "disable filesystem access").option("--nofs")
		.option("-s, --sandbox", "allow the model to use a docker container")
		.option("-p, --profile <name>", "profile name")
		.option("--create-profile <name> <provider> <model>", "create a profile")
		.option("--update-profile <name> <provider> <model>", "update a profile")
		.option("--set-default", "set default profile")
		.option("--list-profiles", "list all profiles")
		.option("--delete-profile <name>", "delete a profile")
		.option("--update-api-key <provider>", "update an API key")
		.helpOption("-?, --help", "display help")
		.parse();
	const options = program.opts();

	const { state, promptForApiKey, saveState, profileToString } = require("./state.js");

	if (options.createProfile || options.updateProfile) {
		if (!program.args[0] || !program.args[1]) {
			console.error("Syntax: slave --create-profile <name> <provider> <model>");
			process.exit(1);
		}
		const provider = program.args[0];
		if (provider != "openai" && provider != "anthropic" && !provider.startsWith("http://") && !provider.startsWith("https://")) {
			console.error(`Invalid provider: ${provider}`);
			process.exit(1);
		}
		const name = options.createProfile || options.updateProfile;
		if (name in state.profiles) {
			if (options.createProfile) {
				console.error("Profile already exists. Did you mean --update-profile?");
				process.exit(1);
			}
		}
		else {
			if (options.updateProfile) {
				console.error("No such profile. Did you mean --create-profile?");
				process.exit(1);
			}
		}
		state.profiles[name] = { provider, model: program.args[1] };
		if (options.setDefault) {
			state.defaultProfile = name;
		}
		if (!state.apiKeys[provider]) {
			await promptForApiKey(provider);
		}
		saveState();
		console.log(`${options.createProfile ? "Created" : "Updated"} ${name} profile${options.setDefault ? " and set as your default" : ""}.`);
		process.exit(0);
	}
	if (options.setDefault) {
		if (!program.args[0]) {
			console.error("No profile name given.");
			process.exit(1);
		}
		state.defaultProfile = program.args[0];
		saveState();
		console.log(`Set ${program.args[0]} as your default profile.`);
		process.exit(0);
	}
	if (options.listProfiles) {
		const names = Object.keys(state.profiles);
		if (names.length == 0) {
			console.log("No profiles.");
		}
		for (const name of names) {
			if (state.defaultProfile == name) {
				console.log(`${name} (default): ${profileToString(state.profiles[name])}`);
			}
			else {
				console.log(`${name}: ${profileToString(state.profiles[name])}`);
			}
		}
		process.exit(0);
	}
	if (options.deleteProfile) {
		if (options.deleteProfile in state.profiles) {
			delete state.profiles[options.deleteProfile];
			saveState();
			console.log(`Deleted ${options.deleteProfile} profile.`);
		}
		else {
			console.log("No such profile.");
		}
		process.exit(0);
	}
	if (options.updateApiKey) {
		await promptForApiKey(options.updateApiKey);
		saveState();
		console.log("Saved.");
		process.exit(0);
	}

	const { markdownToConsoleText } = require("./markdown.js");

	const profile = state.profiles[options.profile ?? state.defaultProfile];
	if (!profile) {
		if (Object.keys(state.profiles).length == 0) {
			console.error(markdownToConsoleText("You don't have any profiles. Use e.g. `slave --create-profile luna openai gpt-6-luna --set-default` to create one."));
		}
		else if (options.profile) {
			console.error(markdownToConsoleText(`No such profile. Use e.g. \`slave --create-profile ${options.profile} openai gpt-6-luna\` to create it.`));
		}
		else {
			console.error(markdownToConsoleText(`You did not specify a profile and no profile is set as your default. Use e.g. \`slave --set-default ${Object.keys(state.profiles)[0]}\` to set **${Object.keys(state.profiles)[0]}** as your default profile.`));
		}
		process.exit(1);
	}

	let prompt = program.args.join(" ").trim();
	if (!prompt) {
		console.error("No prompt given.");
		process.exit(1);
	}

	const { execFileSync } = require("node:child_process");

	const { default: Anthropic } = require("@anthropic-ai/sdk");
	const { default: OpenAI } = require("openai");

	const { initTools, getSandboxName, setSandboxName, anthropic_generateResponseOptionallyUsingTools, openai_generateResponseOptionallyUsingTools } = require("./core.js");
	const { logWrite, logWriteBoth } = require("./log.js");

	let previous_provider_state;
	const overrides = [profileToString(profile)];
	state.providerStates[profile.provider] ??= {};
	if (options.continue || options.cont) {
		previous_provider_state = state.providerStates[profile.provider].previous;
		setSandboxName(state.providerStates[profile.provider].sandbox_name);
	}
	else if (options.amend) {
		previous_provider_state = state.providerStates[profile.provider].previous_previous;
		setSandboxName(state.providerStates[profile.provider].sandbox_name);
	}
	const filesystemEnabled = options.fs !== false && !options.nofs;
	initTools(filesystemEnabled, options.sandbox, options.web);
	if (options.web) {
		overrides.push("web search enabled");
	}
	if (!filesystemEnabled) {
		overrides.push("no filesystem access");
	}
	if (options.sandbox) {
		overrides.push("sandbox enabled");
	}

	logWriteBoth((previous_provider_state ? "FOLLOW-UP" : "PROMPT") + ": " + prompt);
	if (!process.stdin.isTTY) {
		const chunks = [];
		for await (const chunk of process.stdin) {
			chunks.push(chunk);
		}
		prompt = `${Buffer.concat(chunks).toString("utf8")}\n\n${prompt}`;
		overrides.push("stdin provided");
	}
	logWriteBoth(`(${overrides.join(", ")})\n`);

	//console.log({ model: profile.model, prompt, previous_provider_state });

	const clientOpts = {
		apiKey: state.apiKeys[profile.provider],
	};
	let response;
	if (profile.provider == "anthropic") {
		const client = new Anthropic(clientOpts);
		response = await anthropic_generateResponseOptionallyUsingTools(client, profile.model, prompt, previous_provider_state);
	}
	else {
		if (profile.provider != "openai") {
			clientOpts.baseURL = profile.provider;
			clientOpts.apiKey ||= "dummy";
		}
		const client = new OpenAI(clientOpts);
		response = await openai_generateResponseOptionallyUsingTools(client, profile.model, prompt, previous_provider_state);
	}
	state.providerStates[profile.provider].previous_previous = previous_provider_state;
	state.providerStates[profile.provider].previous = response.state;
	if (state.providerStates[profile.provider].sandbox_name && state.providerStates[profile.provider].sandbox_name != getSandboxName()) {
		execFileSync("docker", ["rm", "-f", state.providerStates[profile.provider].sandbox_name], { encoding: "utf8" });
	}
	state.providerStates[profile.provider].sandbox_name = getSandboxName();
	saveState();
	if (response.used_tools) {
		logWriteBoth("");
	}
	console.log(markdownToConsoleText(response.output_text) + "\n");
	logWrite(response.output_text);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
