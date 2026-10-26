import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal());
export const markdownToConsoleText = (md) => {
	const _console_error = console.error; // prevent unintended output about unknown languages, e.g. "```env\ndeez\n```\n"
	console.error = undefined;
	const text = marked.parse(md).trimEnd() + "\n";
	console.error = _console_error;
	return text;
};
