const { marked } = require("marked");
const { markedTerminal } = require("marked-terminal");

marked.use(markedTerminal());
const markdownToConsoleText = (md) => {
	const _console_error = console.error; // prevent unintended output about unknown languages, e.g. "```env\ndeez\n```\n"
	console.error = undefined;
	const text = marked.parse(md).trimEnd() + "\n";
	console.error = _console_error;
	return text;
};

module.exports = { markdownToConsoleText };
