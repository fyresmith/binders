import { BUILT_IN, FIRST, readValue, rowsOf, type Family, type StyleValue, type StyleValues } from './style-rows';

/* A style's file: `Export styles/<name>.bookstyle`, properties and then optional CSS (docs/dev/file-format.md, "Export
   styles"). Read, changed and resolved against the style it is based on. Pure: the vault's side is export/styles.ts.

   The file is changed a line at a time, never parsed and written out again: a property Binders doesn't know, a
   comment, the order of the lines and the CSS under them are the writer's and stay exactly as they were. */

export const STYLE_VERSION = 1;
export const STYLE_EXT = 'bookstyle';
const VERSION = 'export-style', BASED_ON = 'based-on';

export interface StyleFile {
	/** Its `export-style`; 1 when it doesn't say. */
	version: number;
	/** Why it can't be used at all (it isn't a style's file), or null. */
	broken: string | null;
	basedOn: string;
	/** Its top-level properties as read: a scalar, or undefined for anything else (a list, a map). */
	props: Map<string, StyleValue | undefined>;
	/** What is under the properties, as typed. */
	css: string;
}

const KEY = /^([A-Za-z][\w-]*)\s*:(?:\s+(.*)|\s*)$/;

function scalar(raw: string): StyleValue | undefined {
	let s = raw.trim();
	if (s.startsWith('"')) {
		const m = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(s);
		if (!m) return undefined;
		try { return JSON.parse(`"${m[1]}"`) as string; } catch { return undefined; }
	}
	if (s.startsWith('\'')) { const m = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(s); return m ? m[1].replace(/''/g, '\'') : undefined; }
	s = s.replace(/\s+#.*$/, '').trim();
	if (!s || /^[[{|>&*!%@`]/.test(s)) return s ? undefined : '';
	if (s === 'true' || s === 'false') return s === 'true';
	if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
	return s;
}

/** The lines of a file's properties (between its two `---`), and what is around them. Null: it has none. */
function split(text: string): { eol: string; head: string[]; body: string } | null {
	const eol = text.includes('\r\n') ? '\r\n' : '\n', lines = (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text).split(/\r?\n/);
	if (lines[0]?.trim() !== '---') return null;
	const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
	return end < 0 ? null : { eol, head: lines.slice(1, end), body: lines.slice(end + 1).join(eol) };
}

export function readStyleFile(text: string): StyleFile {
	const parts = split(text), props = new Map<string, StyleValue | undefined>();
	if (!parts) return { version: STYLE_VERSION, broken: 'It doesn’t begin with properties between two lines of ---.', basedOn: '', props, css: '' };
	parts.head.forEach((line, i) => {
		const m = KEY.exec(line);
		if (!m) return;
		// (a property with lines of its own under it is a list or a map: not a value a style has)
		const more = /^\s+\S/.test(parts.head[i + 1] ?? '') && !(m[2] ?? '').trim();
		props.set(m[1], more ? undefined : scalar(m[2] ?? ''));
	});
	const v = props.get(VERSION), based = props.get(BASED_ON);
	const broken = v === undefined && props.has(VERSION) || (v !== undefined && !(typeof v === 'number' && Number.isInteger(v) && v >= 1)) ? '“export-style” isn’t a version number.' : null;
	return { version: typeof v === 'number' ? v : STYLE_VERSION, broken, basedOn: typeof based === 'string' ? based.trim() : typeof based === 'number' ? String(based) : '', props, css: parts.body.trim() };
}

const written = (v: StyleValue): string => (typeof v !== 'string' ? String(v) : /^[A-Za-z][A-Za-z0-9 ,.'-]*$/.test(v) && !/^(true|false|null|yes|no|on|off)$/i.test(v) && v === v.trim() ? v : JSON.stringify(v));

/** A style's file with some properties set (undefined takes one out), everything else as it was. `text` null: a new
    file. A file that has no properties to begin with is never given here (it is broken, and is left alone).
    `aside`: properties whose lines, as they are now, stay in the file as comments above the new one. */
export function writeStyleFile(text: string | null, basedOn: string, set: Readonly<Record<string, StyleValue | undefined>>, css?: string, aside: readonly string[] = []): string {
	const parts = (text === null ? null : split(text)) ?? { eol: '\n', head: [], body: '' };
	let head = parts.head;
	const put = (key: string, v: StyleValue | undefined, first = false) => {
		const at = head.findIndex((l) => KEY.exec(l)?.[1] === key);
		// (with the lines that are its own: a value over several)
		let end = at + 1;
		while (at >= 0 && end < head.length && /^\s+\S/.test(head[end])) end++;
		const line = v === undefined ? [] : [`${key}: ${written(v)}`];
		if (at >= 0) head = [...head.slice(0, at), ...(aside.includes(key) ? head.slice(at, end).map((l) => `# ${l}`) : []), ...line, ...head.slice(end)];
		else if (first) head = [...line, ...head];
		else head = [...head, ...line];
	};
	if (!head.some((l) => KEY.exec(l)?.[1] === BASED_ON)) put(BASED_ON, basedOn, true); else put(BASED_ON, basedOn);
	if (!head.some((l) => KEY.exec(l)?.[1] === VERSION)) put(VERSION, STYLE_VERSION, true);
	for (const [k, v] of Object.entries(set)) put(k, v);
	const body = css === undefined ? parts.body : css.trim() ? `${css.trim()}${parts.eol}` : '';
	return ['---', ...head, '---', ...(body ? [body] : [''])].join(parts.eol);
}

/** Whether a file says nothing a style could lose: no property but its version and what it is based on, no CSS. */
export function saysNothing(text: string): boolean {
	const f = readStyleFile(text), parts = split(text);
	return !f.broken && !f.css && !!parts && parts.head.every((l) => !l.trim() || [VERSION, BASED_ON].includes(KEY.exec(l)?.[1] ?? '-'));
}

// ---- a style resolved: its file's differences over the style it is based on ----

export interface Resolved {
	name: string;
	family: Family;
	/** One of Binders' own (its file, if it has one, holds the changes made to it). */
	builtIn: boolean;
	/** What it is based on: for a built-in style, itself as it comes. */
	basedOn: string;
	/** The built-in style at the bottom of what it is based on. */
	root: string;
	/** Every row's value. */
	values: StyleValues;
	/** Every row's value in what it is based on. */
	original: StyleValues;
	/** How many rows its file changes. */
	changes: number;
	css: string;
	/** `newer`: its file is from a newer Binders; `broken`: its file can't be read. Either way the file isn't used
	    and is never written, and the style is what it is based on. */
	state: 'ok' | 'newer' | 'broken';
	hasFile: boolean;
	/** What couldn't be read, in sentences. */
	warnings: string[];
}

/** A style by its name, from the styles' files; null if there is no such style. */
export function resolveStyle(name: string, files: ReadonlyMap<string, StyleFile>, seen: readonly string[] = []): Resolved | null {
	const built = BUILT_IN.get(name), file = files.get(name);
	if (!built && !file) return null;
	const warnings: string[] = [];
	const plain = (n: string): Resolved => { const b = BUILT_IN.get(n) ?? BUILT_IN.get(FIRST.book); return { name: n, family: b?.family ?? 'book', builtIn: true, basedOn: n, root: n, values: { ...b?.values }, original: { ...b?.values }, changes: 0, css: '', state: 'ok', hasFile: false, warnings: [] }; };
	let base: Resolved;
	if (built) base = plain(name);
	else {
		const on = file?.basedOn ?? '', usable = !!file && !file.broken && file.version <= STYLE_VERSION;
		const found = !usable || !on || seen.includes(on) || on === name ? null : resolveStyle(on, files, [...seen, name]);
		if (usable && !found) warnings.push(on ? `“${name}” is based on “${on}”, which ${seen.includes(on) || on === name ? 'is based on it in turn' : 'isn’t among the styles'}. ${FIRST.book} is used in its place.` : `“${name}” doesn’t say what it is based on. ${FIRST.book} is used.`);
		// (the first built-in style, as it is changed here)
		base = found ?? resolveStyle(FIRST.book, files) ?? plain(FIRST.book);
		warnings.push(...base.warnings);
	}
	const out: Resolved = { name, family: base.family, builtIn: !!built, basedOn: built ? name : base.name, root: base.root, values: { ...base.values }, original: { ...base.values }, changes: 0, css: base.css, state: 'ok', hasFile: !!file, warnings };
	if (!file) return out;
	if (file.broken) { out.state = 'broken'; warnings.unshift(`The file of the style “${name}” can’t be read. ${file.broken} ${built ? 'The style is as it comes' : `${base.name} is used in its place`} until the file is put right.`); return out; }
	if (file.version > STYLE_VERSION) { out.state = 'newer'; warnings.unshift(`The style “${name}” was made by a newer version of Binders (its format is ${file.version}; this one reads ${STYLE_VERSION}). ${built ? 'It is used as it comes' : `${base.name} is used in its place`}, and its file is left alone. Update Binders to use it.`); return out; }
	for (const row of rowsOf(out.family)) {
		if (!file.props.has(row.key)) continue;
		const raw = file.props.get(row.key), v = readValue(row, raw);
		if (v === undefined) warnings.push(`In the style “${name}”, “${row.key}” can’t be read${raw === undefined ? '' : ` (${String(raw)})`}. ${base.name === name ? 'The style’s own' : `${base.name}’s`} is used.`);
		else if (v !== out.values[row.key]) { out.values[row.key] = v; out.changes++; }
	}
	out.css = [base.css, file.css].filter((c) => c).join('\n');
	return out;
}

/** Every style there is, built-in ones first and then the writer's own by name. */
export function listStyles(files: ReadonlyMap<string, StyleFile>): Resolved[] {
	const own = [...files.keys()].filter((n) => !BUILT_IN.has(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
	return [...BUILT_IN.keys(), ...own].map((n) => resolveStyle(n, files)).filter((r): r is Resolved => !!r);
}

/** A style as a file that stands by itself: based on a built-in style, with every difference from it written. What
    is sent to another writer, and what a style becomes when the one it was based on is deleted. `keep`: the file it
    has now, whose own lines stay. */
export function standalone(r: Resolved, keep: string | null): string {
	const root = BUILT_IN.get(r.root)?.values ?? {}, set: Record<string, StyleValue | undefined> = {}, aside: string[] = [];
	const file = keep === null ? null : readStyleFile(keep);
	for (const row of rowsOf(r.family)) {
		const value = r.values[row.key] === root[row.key] ? undefined : r.values[row.key];
		// A line of its own that can't be read is the writer's, and is never taken away: it stays as it is, or, where
		// a value has to be written in its place (the one it had from what it was based on), as a comment above it.
		const unread = !!file?.props.has(row.key) && readValue(row, file.props.get(row.key)) === undefined;
		if (unread && value === undefined) continue;
		if (unread) aside.push(row.key);
		set[row.key] = value;
	}
	// (CSS it had from what it was based on comes with it)
	return writeStyleFile(keep, r.root, set, r.css === (file?.css ?? '') ? undefined : r.css, aside);
}

/** A name a style's file can have, or why not. */
export function styleNameProblem(name: string): string | null {
	const n = name.trim();
	if (!n) return 'A style needs a name.';
	if (/[\\/:*?"<>|#^[\]]/.test(n) || n.startsWith('.')) return 'A style’s name can’t start with a dot, or have a character a file name can’t have.';
	return n.length > 80 ? 'That name is too long.' : null;
}

/** The first name that is free: "Classic 2", "Classic 3". */
export function freeName(from: string, taken: (name: string) => boolean): string {
	const stem = from.replace(/ \d+$/, '');
	for (let i = 2; ; i++) if (!taken(`${stem} ${i}`)) return `${stem} ${i}`;
}
