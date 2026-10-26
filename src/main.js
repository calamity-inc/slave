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
		.option("--long, --multiline", "write a multiline prompt")
		.option("-c, --continue", "add your previous invocation to the context of this one").option("--cont")
		.option("-a, --amend", "retry the previous invocation, using the context from before it")
		.option("-w, --web", "allow the model to search the web")
		.option("-n, --no-fs", "disable filesystem access").option("--nofs")
		.option("-r, --readonly", "disable filesystem write access")
		.option("-s, --sandbox", "allow the model to use a docker container")
		.option("-p, --profile <name>", "profile name")
		.option("--create-profile <name> <provider> <model>", "create a profile")
		.option("--update-profile <name> <provider> <model>", "update a profile")
		.option("--set-default", "set default profile")
		.option("--list-profiles", "list all profiles")
		.option("--delete-profile <name>", "delete a profile")
		.option("--update-api-key <provider>", "update an API key")
		.option("--set-system, --set-system-prompt", "set or clear the system prompt")
		.option("--get-system, --get-system-prompt", "get the system prompt")
		.option("--skills", "get info about skills")
		.option("--logs", "get info about logs")
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
		if (Object.hasOwn(state.profiles, name)) {
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
		if (Object.hasOwn(state.profiles, options.deleteProfile)) {
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
	if (options.skills) {
		const { skillsDir, skills } = require("./skills.js");
		console.log(`Skills are loaded from ${skillsDir}`);
		if (Object.keys(skills).length) {
			console.log();
			console.log(`Currently there's ${Object.keys(skills).length} skill${Object.keys(skills).length == 1 ? "" : "s"}:`);
			for (const [name, skill] of Object.entries(skills)) {
				console.log(`- ${name}: ${skill.description}`);
			}
		}
		process.exit(0);
	}
	if (options.logs) {
		const { logDir } = require("./paths.js");
		console.log(`Each invocation that prompts a model creates a log file in ${logDir}`);
		console.log(`When a new log file is created, any log file older than 30 days is deleted.`);
		process.exit(0);
	}
	if (options.getSystemPrompt) {
		const { getSystemPrompt } = require("./core.js");
		const sp = getSystemPrompt();
		if (sp !== undefined) {
			console.log(sp);
		}
		else {
			console.log("No system prompt.");
		}
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
	if (options.multiline) {
		const { createInterface } = require("node:readline");
		console.log("Enter your prompt (Ctrl+D on an empty line to finish):");
		const lines = [];
		if (prompt) {
			lines.push(prompt);
			console.log("> " + prompt);
		}
		prompt = await new Promise((resolve) => {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			rl.setPrompt("> ");
			rl.prompt();
			rl.on("line", (line) => {
				lines.push(line);
				rl.prompt();
			});
			rl.on("close", () => {
				resolve(lines.join("\n"));
			});
		});
		console.log("\n");
	}
	let printedPrompt = prompt.replaceAll("\r", "<CR>").replaceAll("\n", "<NL>").replaceAll("\t", "    ");

	if (options.setSystemPrompt) {
		state.systemPrompt = prompt.trim();
		if (state.systemPrompt) {
			console.log("Set custom system prompt: " + printedPrompt);
		}
		else {
			delete state.systemPrompt;
			console.log("Cleared custom system prompt.");
		}
		saveState();
		process.exit(0);
	}

	if (!prompt) {
		console.error("No prompt given.");
		process.exit(1);
	}

	const { execFileSync } = require("node:child_process");

	const { default: Anthropic } = require("@anthropic-ai/sdk");
	const { default: OpenAI } = require("openai");

	const { initTools, getSandboxName, setSandboxName, anthropic_generateResponseOptionallyUsingTools, openai_generateResponseOptionallyUsingTools } = require("./core.js");
	const { logWrite, logWriteBoth } = require("./log.js");
	const { skills } = require("./skills.js");

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
	const fsMode = (options.fs !== false && !options.nofs) && (options.readonly ? "readonly" : true);
	initTools(fsMode, options.sandbox, options.web);
	if (state.systemPrompt) {
		overrides.push("custom system prompt");
	}
	if (Object.keys(skills).length) {
		overrides.push(`${Object.keys(skills).length} skill${Object.keys(skills).length == 1 ? "" : "s"}`);
	}
	if (options.web) {
		overrides.push("web search enabled");
	}
	if (!fsMode) {
		overrides.push("no filesystem access");
	}
	else if (fsMode == "readonly") {
		overrides.push("read-only filesystem access");
	}
	if (options.sandbox) {
		overrides.push("sandbox enabled");
	}

	if (!process.stdin.isTTY) {
		const chunks = [];
		for await (const chunk of process.stdin) {
			chunks.push(chunk);
		}
		prompt = `${Buffer.concat(chunks).toString("utf8")}\n\n${prompt}`;
		printedPrompt = `[stdin]<NL><NL>${printedPrompt}`;
	}
	console.log((previous_provider_state ? "FOLLOW-UP" : "PROMPT") + ": " + printedPrompt);
	logWrite((previous_provider_state ? "FOLLOW-UP" : "PROMPT") + ": " + prompt);
	logWriteBoth(`(${overrides.join(", ")})\n`);

	/*console.log({ model: profile.model, prompt, previous_provider_state, fsMode });
	return;*/

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
		if (getSandboxName()) {
			execFileSync("docker", ["stop", getSandboxName(), "-t", "0"], { encoding: "utf8" });
		}
	}
	console.log(markdownToConsoleText(response.output_text) + "\n");
	logWrite(response.output_text);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
