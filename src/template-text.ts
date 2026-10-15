/* A template's text made into a new note's: pure, so it can be tested. Variables are filled as Obsidian's Templates core
   plugin fills them (its `app.js`, 1.13): `{{title}}` everywhere, case aside, then `{{date}}`, `{{time}}`,
   `{{date:FORMAT}}` and `{{time:FORMAT}}`, all at one moment, over the whole text, properties included. Templater's
   commands (`<% %>`) are text here: left exactly as written. */

/** Formats a moment: `format` is a Moment.js format string. */
export type Formatter = (format: string) => string;

export interface Formats { date: string; time: string }
export const DEFAULT_FORMATS: Formats = { date: 'YYYY-MM-DD', time: 'HH:mm' };

/** The text with the variables filled: `title` the note's name, `at` formats the one moment they are all filled at. */
export function fillVars(text: string, title: string, at: Formatter, formats: Formats = DEFAULT_FORMATS): string {
	return text
		.replace(/{{title}}/gi, () => title)
		.replace(/{{(date|time)(?::(.*?))?}}/gi, (_m, kind: string, fmt?: string) => at(fmt ? fmt : kind.toLowerCase() === 'date' ? formats.date : formats.time));
}

/** Binders' own keys, which make a note a binder note: a template never passes them on (a scene made from it would
    stop being a scene). */
export const OWN_KEYS = ['binder', 'contents'];

/** The text without the properties in `keys` (top level, with any lines indented under them), every other byte as it
    was. A text whose properties don't open on its first line has none, and is given back as it is. */
export function stripKeys(text: string, keys: readonly string[] = OWN_KEYS): string {
	const m = /^---\r?\n/.exec(text);
	if (!m) return text;
	const start = m[0].length, rest = text.slice(start), close = /(^|\n)---(\r?\n|$)/.exec(rest);
	if (!close) return text;
	const block = rest.slice(0, close.index + close[1].length), end = start + block.length;
	const lines = block.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const out: string[] = [];
	let dropping = false;
	for (const line of lines) {
		const key = /^([^\s#-][^:]*?)\s*:(\s|$)/.exec(line)?.[1]?.replace(/^["']|["']$/g, '');
		if (key !== undefined) dropping = keys.includes(key);
		// (a line under a key, indented or a list's "- ", goes with it; a blank line or a comment ends nothing)
		else if (dropping && !/^(\s|-)/.test(line)) dropping = false;
		if (!dropping) out.push(line);
	}
	return text.slice(0, start) + out.join('') + text.slice(end);
}

/** A new note's text from a template's: Binders' own keys taken out, the variables filled. */
export function noteText(raw: string, title: string, at: Formatter, formats?: Formats): string {
	return fillVars(stripKeys(raw), title, at, formats);
}
