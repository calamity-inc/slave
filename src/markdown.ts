import { marked } from "marked";
// @ts-expect-error This module has no (up-to-date) types
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal());
export const markdownToConsoleText = (md: string): string => {
	const _console_error = console.error; // prevent unintended output about unknown languages, e.g. "```env\ndeez\n```\n"
	(console as any).error = undefined;
	const text = (marked.parse(md) as string).trimEnd() + "\n";
	console.error = _console_error;
	return text;
};
