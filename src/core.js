"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { randomInt } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const chalk = require("chalk").default;
const ignore = require("ignore");

const { logWrite } = require("./log.js");
const { skills } = require("./skills.js");

const slaveignore = ignore();
if (fs.existsSync(".slaveignore")) {
	slaveignore.add(fs.readFileSync(".slaveignore", "utf8").replaceAll("/\n", "\n"));
}
const gitignore = ignore();
if (fs.existsSync(".gitignore")) {
	gitignore.add(fs.readFileSync(".gitignore", "utf8").replaceAll("/\n", "\n"));
}
const isOutOfReach = (p, accessType) => {
	const rel = path.relative(".", p);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		return true;
	}
	const segs = rel.split(path.sep);
	if (segs.includes(".git") || segs.some(seg => seg.startsWith(".env"))) {
		return true;
	}
	if (rel && (slaveignore.ignores(rel) || (accessType == "write" && gitignore.ignores(rel)))) {
		return true;
	}
	return false;
};

const isPathWithinFolder = (folder, p) => {
	const rel = path.relative(folder, p);
	return !rel.startsWith("..") && !path.isAbsolute(rel);
};

const fixPath = (path, accessType) => {
	if (path.startsWith("/")) {
		path = path.substring(1);
		path ||= ".";
	}
	return isOutOfReach(path, accessType) ? "" : path;
};

const readFileForModel = (filePath) => fs.readFileSync(filePath, "utf8").replaceAll("\r\n", "\n");
const writeFileFromModel = (filePath, data, usesCRLF) => {
	if (fs.existsSync(filePath)) {
		if (usesCRLF === undefined) {
			usesCRLF = fs.readFileSync(filePath, "utf8").includes("\r\n");
		}
	}
	else {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
	}
	const normalized = data.replaceAll("\r\n", "\n");
	fs.writeFileSync(filePath, usesCRLF ? normalized.replaceAll("\n", "\r\n") : normalized, "utf8");
};

const getSystemPrompt = () => {
	const entries = Object.entries(skills);
	if (entries.length == 0) {
		return undefined;
	}
	return "You have the following skills available:\n" + entries.map(([name, skill]) => `- ${name}: ${skill.description}`).join("\n");
};
const getSkillResourcePath = (name, resourcePath) => {
	if (name in skills) {
		const absResourcePath = path.join(skills[name].path, resourcePath); 
		if (isPathWithinFolder(skills[name].path, absResourcePath)) {
			if (fs.existsSync(absResourcePath)) {
				return [true, absResourcePath];
			}
			return [false, "No such resource"];
		}
		return [false, "I'm gonna call the alignment police on you!!!"];
	}
	return [false, "No such skill"];
};

let sandbox_name;
const getSandboxName = () => {
	return sandbox_name;
};
const setSandboxName = (sn) => {
	sandbox_name = sn;
};
const ensureSandbox = () => {
	if (!sandbox_name) {
		sandbox_name = "slave-sandbox-" + Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)]).join("");
		// `docker pull ghcr.io/calamity-inc/slave-sandbox` is not needed to get the image, but would be needed to update it.
		execFileSync("docker", ["run", "-d", "--name", sandbox_name, "ghcr.io/calamity-inc/slave-sandbox", "sleep", "infinity"], { encoding: "utf8" });
	}
};
const copyFileToSandbox = (hostPath, sbxPath) => {
	ensureSandbox();
	try {
		execFileSync("docker", ["cp", "-L", hostPath, `${sandbox_name}:${sbxPath}`], { encoding: "utf8" });
		return "OK";
	}
	catch (e) {
		return (e.stdout ?? e.message).trimEnd();
	}
};

const functions = {
	listFiles: ({ path }) => {
		path ??= ".";
		path = fixPath(path);
		if (!path) {
			return "Out of your reach";
		}
		let files;
		try {
			files = fs.readdirSync(path, { withFileTypes: true });
		}
		catch (e) {
			return e.code;
		}
		return JSON.stringify(files.map(dirent => dirent.isDirectory() ? `${dirent.name}/` : dirent.name));
	},
	findFiles: ({ path, substring, recursive }) => {
		path ??= ".";
		path = fixPath(path);
		if (!path) {
			return "Out of your reach";
		}
		let files;
		try {
			files = fs.readdirSync(path, { withFileTypes: true, recursive });
		}
		catch (e) {
			return e.code;
		}
		files = files.filter(dirent => dirent.isFile())
			.map(dirent => {
				if (dirent.parentPath != ".") {
					return `${dirent.parentPath.replaceAll("\\", "/")}/${dirent.name}`
				}
				return dirent.name;
			})
			.filter(file => !isOutOfReach(file));
		const res = [];
		for (const file of files) {
			try {
				const matches = readFileForModel(file).split(substring).length - 1;
				if (matches) {
					res.push(`${file} has ${matches} match${matches == 1 ? "" : "es"}`);
				}
			}
			catch (e) {
				// file might be busy, skip it
			}
		}
		return res.join("\n");
	},
	readFile: ({ path }) => {
		path = fixPath(path);
		if (!path) {
			return "You don't have read access to this file";
		}
		if (!fs.existsSync(path) || !fs.statSync(path).isFile()) {
			return "No such file";
		}
		const cont = readFileForModel(path);
		if (cont.length > 10485760) {
			return "File is over 10485760 characters long";
		}
		return cont;
	},
	writeFile: ({ path, data }) => {
		path = fixPath(path, "write");
		if (!path) {
			return "You don't have write access to this file";
		}
		writeFileFromModel(path, data);
		return "OK";
	},
	fileFindAndReplace: ({ path, substring, replacement, expectedMatches }) => {
		path = fixPath(path, "write");
		if (!path) {
			return "You don't have write access to this file";
		}
		const fileContent = fs.readFileSync(path, "utf8");
		const usesCRLF = fileContent.includes("\r\n");
		const arr = fileContent.replaceAll("\r\n", "\n").split(substring);
		const matches = arr.length - 1;
		if (matches == 0 || (expectedMatches && matches != expectedMatches)) {
			return `There were ${matches} match${matches == 1 ? "" : "es"}`;
		}
		writeFileFromModel(path, arr.join(replacement), usesCRLF);
		return "OK";
	},
	sandboxExec: ({ command, args }) => {
		ensureSandbox();
		const result = spawnSync("docker", [ "exec", sandbox_name, command, ...args ], { encoding: "utf8" });
		const output = (result.stdout ?? "") + (result.stderr ?? "");
		if (result.error) {
			return (output || result.error.message).trimEnd();
		}
		if (result.status !== 0 && !output) {
			return `Command exited with status ${result.status}`;
		}
		return output;
	},
	sandboxCopyIn: ({ hostPath, sbxPath }) => {
		hostPath = fixPath(hostPath);
		if (!hostPath) {
			return "You don't have read access to this file";
		}
		if (!fs.existsSync(hostPath) || !fs.statSync(hostPath).isFile()) {
			return "Host path must point to a file";
		}
		return copyFileToSandbox(hostPath, sbxPath);
	},
	sandboxCopyOut: ({ sbxPath, hostPath }) => {
		hostPath = fixPath(hostPath, "write");
		if (!hostPath) {
			return "You don't have write access to this file";
		}
		const isCreate = !fs.existsSync(hostPath);
		if (!isCreate && !fs.statSync(hostPath).isFile()) {
			return "Host path must point to a file";
		}
		ensureSandbox();
		if (isCreate) {
			fs.mkdirSync(path.dirname(hostPath), { recursive: true });
		}
		execFileSync("docker", ["cp", "-L", `${sandbox_name}:${sbxPath}`, hostPath], { encoding: "utf8" });
		return "OK";
	},
	readSkill: ({ name }) => {
		if (name in skills) {
			return readFileForModel(path.join(skills[name].path, "SKILL.md"));
		}
		return "No such skill";
	},
	readSkillResource: ({ name, path }) => {
		const [ok, res] = getSkillResourcePath(name, path)
		if (ok) {
			return readFileForModel(res);
		}
		return res;
	},
	copySkillResourceToSandbox: ({ name, path, sbxPath }) => {
		const [ok, res] = getSkillResourcePath(name, path)
		if (ok) {
			return copyFileToSandbox(res, sbxPath);
		}
		return res;
	},
	/*system: ({ command }) => {
		//process.exit(1);
		return "It's interesting that you called this tool! Unfortunately for you, it does nothing.";
	}*/
};

const tools = [];
const initTools = (fs, sandbox, web_search) => {
	if (fs) {
		tools.push(
			{
				type: "function",
				name: "listFiles",
				parameters: {
					type: "object",
					properties: {
						path: { type: ["string", "null"] },
					},
					required: [ "path" ],
					additionalProperties: false,
				},
				strict: true,
			},
			{
				type: "function",
				name: "findFiles",
				description: "Searches the contents of files for a literal text string",
				parameters: {
					type: "object",
					properties: {
						path: { type: ["string", "null"] },
						substring: { type: "string" },
						recursive: { type: ["boolean", "null"] },
					},
					required: [ "path", "substring", "recursive" ],
					additionalProperties: false,
				},
				strict: true,
			},
			{
				type: "function",
				name: "readFile",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string" },
					},
					required: [ "path" ],
					additionalProperties: false,
				},
				strict: true,
			},
			{
				type: "function",
				name: "writeFile",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string" },
						data: { type: "string" },
					},
					required: [ "path", "data" ],
					additionalProperties: false,
				},
				strict: true,
			},
			{
				type: "function",
				name: "fileFindAndReplace",
				parameters: {
					type: "object",
					properties: {
						path: { type: "string" },
						substring: { type: "string" },
						replacement: { type: "string" },
						expectedMatches: { type: ["number", "null"] },
					},
					required: [ "path", "substring", "replacement", "expectedMatches" ],
					additionalProperties: false,
				},
				strict: true,
			},
		);
	}
	if (sandbox) {
		tools.push({
			type: "function",
			name: "sandboxExec",
			description: "Runs a command without Bash in an isolated sandbox.",
			parameters: {
				type: "object",
				properties: {
					command: { type: "string" },
					args: { type: "array", items: { type: "string" } },
				},
				required: [ "command", "args" ],
				additionalProperties: false,
			},
			strict: true,
		});
		if (fs) {
			tools.push(
				{
					type: "function",
					name: "sandboxCopyIn",
					parameters: {
						type: "object",
						properties: {
							hostPath: { type: "string" },
							sbxPath: { type: "string" },
						},
						required: [ "hostPath", "sbxPath" ],
						additionalProperties: false,
					},
					strict: true,
				},
				{
					type: "function",
					name: "sandboxCopyOut",
					parameters: {
						type: "object",
						properties: {
							sbxPath: { type: "string" },
							hostPath: { type: "string" },
						},
						required: [ "sbxPath", "hostPath" ],
						additionalProperties: false,
					},
					strict: true,
				},
			);
		}
	}
	if (Object.keys(skills).length) {
		tools.push(
			{
				type: "function",
				name: "readSkill",
				parameters: {
					type: "object",
					properties: {
						name: { type: "string" },
					},
					required: [ "name" ],
					additionalProperties: false,
				},
				strict: true,
			},
			{
				type: "function",
				name: "readSkillResource",
				parameters: {
					type: "object",
					properties: {
						name: { type: "string" },
						path: { type: "string" },
					},
					required: [ "name", "path" ],
					additionalProperties: false,
				},
				strict: true,
			},
		);
		if (sandbox) {
			tools.push({
				type: "function",
				name: "copySkillResourceToSandbox",
				parameters: {
					type: "object",
					properties: {
						name: { type: "string" },
						path: { type: "string" },
						sbxPath: { type: "string" },
					},
					required: [ "name", "path", "sbxPath" ],
					additionalProperties: false,
				},
				strict: true,
			});
		}
	}
	if (web_search) {
		tools.push({ type: "web_search" });
	}
};

const toolToAnthropic = (t) => {
	if (t.type == "function") {
		return {
			name: t.name,
			description: t.description,
			input_schema: t.parameters,
			strict: t.strict,
		};
	}
	else if (t.type == "web_search") {
		return {
			type: "web_search_20260318",
			name: "web_search"
		};
	}
};

const printJunk = (line) => {
	logWrite(line);
	line = line.replaceAll("\r", "<CR>").replaceAll("\n", "<NL>").replaceAll("\t", "    ");
	if (line.length > 80) {
		line = line.substring(0, 77) + "...";
	}
	console.log(line);
}

const useTool = (name, args, argsStr) => {
	printJunk("$ " + name + argsStr);
	const output = String(functions[name](args));
	printJunk(output);
	return output;
};

const openai_generateResponseOptionallyUsingTools = async (client, model, input, state) => {
	let response = await client.responses.create({
		model,
		instructions: getSystemPrompt(),
		previous_response_id: state,
		input,
		tools,
	});
	let used_tools = false;

	while (true) {
		const toolCalls = response.output.filter((item) => item.type == "function_call");
		if (toolCalls.length == 0) {
			break;
		}

		const outputs = toolCalls.map((call) => {
			return {
				type: "function_call_output",
				call_id: call.call_id,
				output: useTool(call.name, JSON.parse(call.arguments), call.arguments)
			};
		});

		response = await client.responses.create({
			model,
			instructions: getSystemPrompt(),
			previous_response_id: response.id,
			input: outputs,
			tools,
		});
		used_tools = true;
	}

	return {
		output_text: response.output_text,
		state: response.id,
		used_tools,
	};
};

const anthropic_streamMessage = (client, res, params) => {
	const stream = client.messages.stream(params);
	let thought = "";
	stream.on("thinking", (delta) => {
		thought += delta;
		const i = thought.indexOf("\n\n");
		if (i != -1) {
			console.log(chalk.gray(thought.substring(0, i)));
			logWrite(`[Thought summary: ${thought.substring(0, i)}]`);
			res.used_tools = true; // Need a newline before response just the same
			thought = thought.substring(i + 2);
		}
	});
	stream.on("contentBlock", () => {
		if (thought) {
			console.log(chalk.gray(thought));
			logWrite(`[Thought summary: ${thought}]`);
			res.used_tools = true; // Need a newline before response just the same
			thought = "";
		}
	});
	return stream.finalMessage();
};

const anthropic_generateResponseOptionallyUsingTools = async (client, model, input, state) => {
	state = JSON.parse(state || "[]");
	state.push({ role: "user", content: input });
	const res = { used_tools: false };

	const anthropicTools = tools.map(t => toolToAnthropic(t));

	let message = await anthropic_streamMessage(client, res, {
		model,
		max_tokens: 64000,
		thinking: { type: "adaptive", display: "summarized" },
		cache_control: { type: "ephemeral" },
		system: getSystemPrompt(),
		messages: state,
		tools: anthropicTools,
	});
	state.push({ role: message.role, content: message.content });

	while (message.stop_reason == "tool_use" || message.stop_reason == "pause_turn") {
		const toolCalls = message.content.filter((item) => item.type == "tool_use");
		if (toolCalls.length) {
			const outputs = toolCalls.map((call) => {
				return {
					type: "tool_result",
					tool_use_id: call.id,
					content: useTool(call.name, call.input, JSON.stringify(call.input))
				};
			});
			state.push({ role: "user", content: outputs });
			res.used_tools = true;
		}

		/*if (message.stop_reason == "max_tokens" && message.content[message.content.length].type == "thinking") {
			state.push({ role: "user", content: "Please continue from where you left off." });
		}*/

		message = await anthropic_streamMessage(client, res, {
			model,
			max_tokens: 64000,
			thinking: { type: "adaptive", display: "summarized" },
			cache_control: { type: "ephemeral" },
			system: getSystemPrompt(),
			messages: state,
			tools: anthropicTools,
		});
		state.push({ role: message.role, content: message.content });
	}

	if (message.stop_reason != "end_turn") {
		logWrite(`unexpected stop_reason: ${message.stop_reason}\n${JSON.stringify(message, null, 2)}`);
		console.log(message);
		throw new Error(`unexpected stop_reason: ${message.stop_reason}`);
	}

	//console.log(message);
	res.output_text = message.content.find((item) => item.type == "text").text;
	res.state = JSON.stringify(state);
	return res;
};

module.exports = {
	initTools,
	getSandboxName,
	setSandboxName,
	openai_generateResponseOptionallyUsingTools,
	anthropic_generateResponseOptionallyUsingTools,
};
