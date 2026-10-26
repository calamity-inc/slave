"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { configDir } = require("./paths.js");

const skillsDir = path.join(configDir, "skills");

const unquote = (value) => {
	const first = value[0];
	if ((first === "\"" || first === "'") && value.at(-1) === first && value.length >= 2) {
		return value.slice(1, -1);
	}
	return value;
};

const parseFrontmatter = (text) => {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!match) {
		return {};
	}

	const fields = {};
	let currentKey = null;
	for (const line of match[1].split(/\r?\n/)) {
		const keyValue = /^([\w-]+):\s*(.*)$/.exec(line);
		if (keyValue) {
			currentKey = keyValue[1];
			const raw = keyValue[2].trim();
			// Block scalars (| or >) are folded into a single line below.
			fields[currentKey] = /^[>|][+-]?$/.test(raw) ? "" : unquote(raw);
		}
		else if (currentKey && /^\s+\S/.test(line)) {
			// Indented continuation line of a multi-line value.
			fields[currentKey] = `${fields[currentKey]} ${line.trim()}`.trim();
		}
	}
	return fields;
};

fs.mkdirSync(skillsDir, { recursive: true });
const skills = {};
for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
	if (entry.isDirectory()) {
		const skillPath = path.join(skillsDir, entry.name);
		const skillFile = path.join(skillPath, "SKILL.md");
		if (!fs.existsSync(skillFile)) {
			console.log(`Invalid skill (missing SKILL.md): ${skillPath}`);
			continue;
		}
		const frontmatter = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
		if (!frontmatter.description) {
			console.log(`Invalid skill (missing description): ${skillPath}`);
			continue;
		}
		skills[frontmatter.name || entry.name] = {
			path: skillPath,
			description: frontmatter.description,
		};
	}
}

module.exports = { skillsDir, skills };
