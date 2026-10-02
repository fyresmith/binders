/* The text side of working with scenes: where a note's properties end and its text begins, splitting a note in two,
   joining notes, a synopsis from a note's opening, names for new notes, and compiling a binder into one text. Pure, so
   every rule here is unit-tested: these are the places writing could be lost. */

/* Where a note's properties end and its text begins. This is the one place that says so: splitting, merging,
   compiling, a synopsis from the text, snapshots, and the manuscript's and focus mode's cursor all ask here, because a
   wrong answer loses writing (text taken for properties is left out of a merge, a compile and a snapshot).

   The rule is Obsidian's own, measured (the table in tests/e2e/specs-snapshots.mjs, “what Obsidian takes for
   properties”, holds this file to it):
     - a block opens with `---` alone on the note's first line, and closes at the next line that starts with `---`,
       whatever follows on that line. These are the edges Obsidian's metadata cache uses. (`getFrontMatterInfo` is
       stricter about the closing line and says nothing of what's inside, which is how text was lost.)
     - it is properties if what's between reads as properties: YAML that is a mapping. The cache has properties for a
       note exactly then.
     - it is properties, too, if it holds nothing: no lines, blank lines, comments. The cache has no properties for
       such a note, but Obsidian's editor and its reading view hide the block just as they hide properties, so the
       writer never sees it as text: the text starts after it (a cursor put before it would be in a hidden block), and
       it stays out of a compile (where a `# comment` would be a heading).
     - anything else between two rules (a paragraph, a list, YAML that can't be read) is the writer's text, as
       Obsidian's editor shows it, and then the whole note is text: its opening rule, that paragraph, the rule after.

   The answer is worked out from the text in hand, with Obsidian's own YAML parser, and not asked of the cache: the
   cache is brought up to date a moment after a note is written, so it can describe an older text than the one just
   read, and a newer text cut at an older text's offsets is cut in the wrong place. */

const BREAK = '(?:\\r\\n|\\n|\\r)';
const OPEN = new RegExp(`^\\uFEFF?---${BREAK}`), CLOSE = new RegExp(`(?:^|${BREAK})---`), REST = new RegExp(`^[ \\t]*(?:${BREAK}|$)`);
const NOTHING = new RegExp(`^(?:[ \\t]*(?:#[^\\r\\n]*)?(?:${BREAK}|$))*$`);

/** Reads YAML, as Obsidian does: `scenes.ts` hands over Obsidian's own `parseYaml` when the plugin loads (this file
    imports nothing of Obsidian's). Without it (unit tests, in Node) `looksLikeMapping` stands in. */
let yamlReader: ((yaml: string) => unknown) | null = null;
/** What was asked before, by the block's text: the manuscript asks on every key, of the same few blocks. */
const asked = new Map<string, boolean>();
export function useYaml(read: ((yaml: string) => unknown) | null): void { yamlReader = read; asked.clear(); }

/** A stand-in for a YAML parser, erring towards "this is text": properties are lines of `key: value` at the margin,
    with lists and indented lines under a key, comments and blank lines. */
function looksLikeMapping(yaml: string): boolean {
	let keys = 0, bare = false; // bare: the last key had nothing after its colon, so a list may follow at the margin
	for (const line of yaml.split(/\r\n|\n|\r/)) {
		if (!line.trim() || /^\s*#/.test(line)) continue;
		if (/^\t/.test(line)) return false;
		if (line.startsWith(' ')) { if (!keys) return false; continue; }
		if (/^-(\s|$)/.test(line)) { if (!bare) return false; continue; }
		const m = /^(?:"[^"]*"|'[^']*'|[^\s\-?:,[\]{}#&*!|>'"%@`][^:]*(?::\S[^:]*)*):(?:[ \t]+(.*))?$/.exec(line);
		if (!m) return false;
		keys++;
		bare = !m[1]?.trim();
	}
	return keys > 0;
}

function isProperties(yaml: string): boolean {
	if (NOTHING.test(yaml)) return true;
	if (!yamlReader) return looksLikeMapping(yaml);
	let is = asked.get(yaml);
	if (is === undefined) {
		try { const v = yamlReader(yaml); is = !!v && typeof v === 'object' && !Array.isArray(v); } catch { is = false; }
		if (asked.size > 500) asked.clear();
		asked.set(yaml, is);
	}
	return is;
}

/** A note as what comes before its text (`front`: its properties block, with its `---` lines and the line break
    after; "" if it has none), its text (`body`), and what the block says between its rules (`yaml`). `front + body` is
    always the note: nothing is dropped here, and a block that isn't properties is part of the text.
    (A byte-order mark is no text: it goes in `front`, with or without properties. Obsidian's `vault.read` drops the
    mark and its `vault.process` hands it over, so the same note comes with and without it.) */
export function parts(text: string): { front: string; body: string; yaml: string } {
	const b = block(text), yaml = b ? text.slice(b.from, b.to) : '';
	if (!b || !isProperties(yaml)) { const mark = text.startsWith('\uFEFF') ? 1 : 0; return { front: text.slice(0, mark), body: text.slice(mark), yaml: '' }; }
	// (spaces after the closing rule, and its line break, go with it; anything else on that line is text)
	const end = b.end + (REST.exec(text.slice(b.end))?.[0].length ?? 0);
	return { front: text.slice(0, end), body: text.slice(end), yaml };
}

/** A note's `front` ready for text to follow: properties whose closing rule ends the file get a line break, or the
    text would run into that rule. */
export const frontFor = (front: string): string => (/---[ \t]*$/.test(front) ? front + '\n' : front);

/** The block a note opens with, whatever is in it: where what's between its rules starts and ends, and where the
    closing rule ends. Null if the note doesn't open with one. */
function block(text: string): { from: number; to: number; end: number } | null {
	const open = OPEN.exec(text);
	if (!open) return null;
	const from = open[0].length, close = CLOSE.exec(text.slice(from));
	return close ? { from, to: from + close.index, end: from + close.index + close[0].length } : null;
}

/** Does a note open with a block that isn't properties: a rule, some text, and a rule? Obsidian's own
    `processFrontMatter` takes any such block for properties and writes over it, so a property must never be written
    to such a note that way: the text between the rules would be gone. */
export function blockIsText(text: string): boolean {
	const b = block(text);
	return !!b && !isProperties(text.slice(b.from, b.to));
}

/** A note's text as Obsidian's renderer must be given it: a text that opens with a rule gets a blank line above it.
    The renderer knows nothing of the properties that were cut off, and would take everything from that rule to the
    next for properties and hide it. */
export const forRender = (body: string): string => (/^\uFEFF?---/.test(body) ? '\n' + body : body);

/** Where a note's text starts, after its properties: what the manuscript and focus mode count a cursor's place from. */
export const bodyStart = (text: string): number => parts(text).front.length;

/** A text with one kind of line break: an editor has only `\n`, whatever the file has, so two texts are compared
    through this. */
export const lf = (text: string): string => text.replace(/\r\n?/g, '\n');

/** Where position `p` of `was` is in `now`, the same text with one stretch of it changed: before the change it
    stays, after it it moves along, inside it it goes to the change's end. */
export function moved(was: string, now: string, p: number): number {
	if (was === now) return p;
	let a = 0;
	while (a < was.length && a < now.length && was[a] === now[a]) a++;
	let e = 0;
	while (e < was.length - a && e < now.length - a && was[was.length - 1 - e] === now[now.length - 1 - e]) e++;
	return p <= a ? p : p >= was.length - e ? p + now.length - was.length : now.length - e;
}

/** Splits a note at `offset` (a position in the whole text): what stays, and what goes to the new note. Null if the
    position is inside the properties. Nothing is dropped: `head + tail` is the note's text. */
export function splitAt(text: string, offset: number): { head: string; tail: string } | null {
	const { front } = parts(text);
	if (offset < front.length || offset > text.length) return null;
	return { head: text.slice(0, offset), tail: text.slice(offset) };
}

/** The text a split leaves in the first note: as it was up to the split, ending in one line break. */
export const tidyHead = (head: string): string => (parts(head).body.trim() ? head.replace(/\s+$/, '') + '\n' : head.replace(/[ \t]+$/, ''));
/** The text a split gives the new note: without the blank lines the split left at its start, nor, for a split in the
    middle of a line, the space before its first word. A line's own indent stays (an indented code block, a nested
    list item). */
export const tidyTail = (tail: string, midLine = true): string => { const t = tail.replace(/^\s*\n/, ''); return midLine && t === tail ? t.replace(/^[ \t]+(?=\S)/, '') : t; };

/** A fenced code block, from its opening fence to its closing one (or the end of the text). */
const FENCED = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]{0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;
/** Code, fenced or between backticks: where the marks of comments and links are just text. */
const CODE = '^[ \\t]{0,3}(`{3,}|~{3,})[^\\n]*\\n[\\s\\S]*?(?:^[ \\t]{0,3}\\1[`~]*[ \\t]*$|(?![\\s\\S]))|(`+)(?!`)[^\\n]*?[^`\\n]\\2(?!`)';

/** Text without its comments (`%%…%%` and HTML ones), which Obsidian doesn't show when reading. Code is left alone:
    in a fenced block or between backticks those marks are the writer's text. */
export function stripComments(text: string): string {
	const re = new RegExp(CODE + '|%%[\\s\\S]*?%%|<!--[\\s\\S]*?-->', 'gm');
	return text.replace(re, (m) => (m.startsWith('%%') || m.startsWith('<!--') ? '' : m));
}

/** Points links somewhere else: for every `[[note#part|shown]]`, `![[note]]` and `[shown](note.md#part)` in a text,
    `to(note, part)` gives the note to link to instead (as link text, without `.md`), or null to leave the link as it
    is. Only the note changes: the part, the shown text and the kind of link stay. Code is left alone.
    (In a table Obsidian writes the bar before the shown text with a backslash, `[[note\|shown]]`: the backslash goes
    with the bar, not with the note's name.) */
export function repointLinks(text: string, to: (path: string, subpath: string) => string | null): string {
	const re = new RegExp(CODE + '|(!?\\[\\[)([^\\]|#\\n]*?)(#[^\\]|\\n]*?)?((?:\\\\?\\|[^\\]\\n]*)?\\]\\])|(!?\\[[^\\]\\n]*\\]\\()(<[^>\\n]*>|[^)\\s]*)(\\))', 'gm');
	return text.replace(re, (m: string, _f: string, _t: string, open: string | undefined, path: string, sub: string | undefined, close: string, mdOpen: string | undefined, target: string, mdClose: string) => {
		if (open !== undefined) {
			const next = to(path.trim(), sub ?? '');
			return next == null ? m : `${open}${next}${sub ?? ''}${close}`;
		}
		if (mdOpen === undefined) return m; // code
		const angled = target.startsWith('<'), raw = angled ? target.slice(1, -1) : target;
		if (!raw || /^[a-z][\w+.-]*:/i.test(raw)) return m; // a web address, not a note
		const at = raw.indexOf('#'), file = at < 0 ? raw : raw.slice(0, at), part = at < 0 ? '' : raw.slice(at);
		let plain = file;
		try { plain = decodeURIComponent(file); } catch { /* as written */ }
		const md = /\.md$/i.test(plain), next = to(md ? plain.slice(0, -3) : plain, safeDecode(part));
		if (next == null) return m;
		const out = next + (md ? '.md' : '');
		return `${mdOpen}${angled ? `<${out}${part}>` : encodeURI(out).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29')) + part}${mdClose}`;
	});
}
const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** Headings and block ids in a text, as links name them (`#Heading`, `#^id`): what a link's part can point at. */
export function linkTargets(text: string): { headings: Set<string>; blocks: Set<string> } {
	const body = text.replace(FENCED, '\n'), headings = new Set<string>(), blocks = new Set<string>();
	for (const m of body.matchAll(/^ {0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm)) headings.add(linkName(m[1]));
	for (const m of body.matchAll(/(?:^|\s)\^([\w-]+)[ \t]*$/gm)) blocks.add(m[1].toLowerCase());
	return { headings, blocks };
}
/** A heading as a link spells it: Obsidian drops the characters a link can't have and squeezes spaces. */
export const linkName = (heading: string): string => heading.replace(/[#|^[\]\\:%]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Does a link's part (`#Heading`, `#Heading#Sub`, `#^id`) point at one of these? */
export function pointsAt(subpath: string, targets: { headings: Set<string>; blocks: Set<string> }): boolean {
	const s = subpath.replace(/^#/, '');
	if (!s) return false;
	if (s.startsWith('^')) return targets.blocks.has(s.slice(1).toLowerCase());
	return targets.headings.has(linkName(s.split('#')[0]));
}

/** Footnotes of a text given labels no earlier text used (`used` is added to): two notes that each have a `[^1]`
    would, compiled into one, both show the first note's footnote. */
export function uniqueFootnotes(text: string, used: Set<string>): string {
	const mine = new Set([...text.matchAll(/^\[\^([^\]\s]+)\]:/gm)].map((m) => m[1]));
	const rename = new Map<string, string>();
	for (const label of mine) {
		if (!used.has(label)) continue;
		let n = 2;
		while (used.has(`${label}-${n}`) || mine.has(`${label}-${n}`)) n++;
		rename.set(label, `${label}-${n}`);
	}
	for (const label of mine) used.add(rename.get(label) ?? label);
	if (!rename.size) return text;
	const re = new RegExp(CODE + '|\\[\\^([^\\]\\s]+)\\]', 'gm');
	return text.replace(re, (m: string, _f: string, _t: string, label: string | undefined) => (label !== undefined && rename.has(label) ? `[^${rename.get(label)}]` : m));
}

/** As much of a text as fits in `max` characters (whole ones: never half an emoji), cut at a word when that keeps
    most of it. */
function clip(s: string, max: number): { text: string; cut: boolean } {
	const chars = Array.from(s);
	if (chars.length <= max) return { text: s, cut: false };
	const cut = chars.slice(0, max).join(''), at = cut.lastIndexOf(' ');
	return { text: at > cut.length * 0.6 ? cut.slice(0, at) : cut, cut: true };
}

/** Joins notes' texts into one, a blank line between them (blank notes add nothing). */
export function joinBodies(bodies: readonly string[]): string {
	const kept = bodies.map((b) => b.replace(/^\s*\n/, '').replace(/\s+$/, '')).filter((b) => b.trim());
	return kept.length ? kept.join('\n\n') + '\n' : '';
}

/** A synopsis from a note's text: its first paragraph that isn't a heading, a rule or an embed, as plain text, cut at a
    word once it's long. "" if there's nothing to say. */
export function synopsisFrom(text: string, max = 280): string {
	// (code says nothing about a scene: fenced blocks go whole, and so do tables)
	const body = stripComments(parts(text).body).replace(FENCED, '\n');
	for (const block of body.split(/\r?\n\s*\r?\n/)) {
		const lines = block.split(/\r?\n/).map((l) => l.trim())
			.filter((l) => l && !/^(#{1,6}\s|[-*_]{3,}$|!\[|\|)/.test(l) && !/^\[\^[^\]]+\]:/.test(l))
			// a quote's marks and a callout's kind aren't its words
			.map((l) => l.replace(/^(>\s*)+/, '').replace(/^\[![\w-]+\][+-]?\s*/, ''))
			.filter((l) => l);
		let s = lines.join(' ')
			.replace(/!\[\[[^\]]*\]\]/g, '')
			.replace(/\[\^[^\]]+\]/g, '')
			.replace(/\^\[[^\]]*\]/g, '')
			.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/^(>\s*|[-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)/, '')
			.replace(/(\*\*|__|~~|==|`)/g, '')
			.replace(/(^|[^\w*])[*_](\S(?:[^*_]*\S)?)[*_](?=[^\w*]|$)/g, '$1$2')
			.replace(/\s+/g, ' ').trim();
		if (!s) continue;
		const c = clip(s, max);
		if (c.cut) s = c.text.replace(/[\s,;:.!?…-]+$/, '') + '…';
		return s;
	}
	return '';
}

/** A note's name from selected text ("Split with selection as title"): its first line without Markdown marks or the
    characters a file name can't have, not too long. "" if nothing usable is selected. */
export function titleFrom(selection: string, max = 80): string {
	const line = selection.split(/\r?\n/).map((l) => l.trim()).find((l) => l) ?? '';
	let s = line.replace(/^#{1,6}\s+/, '').replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/(\*\*|__|~~|==|`|\*|_)/g, '')
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
	s = clip(s, max).text.trim();
	return s;
}

/** A name for a copy or a second half that isn't taken, counting on from a number the name ends in: "Scene" gives
    "Scene 2", "Scene 5" gives "Scene 6", and on until one is free. */
export function nextName(name: string, taken: (name: string) => boolean): string {
	const m = /^(.*?)(?:\s+(\d+))?$/.exec(name.trim()), base = m?.[1] || name.trim();
	// (a number written with zeros in front keeps its width: "Scene 01" gives "Scene 02")
	const width = m?.[2]?.length ?? 0;
	for (let n = m?.[2] ? Number(m[2]) + 1 : 2; ; n++) { const next = `${base} ${String(n).padStart(width, '0')}`; if (!taken(next)) return next; }
}

// ---- compiling ----

export interface CompileOptions {
	/** What goes between two scenes in the same folder: a line of its own ("#", "* * *"), or "" for just a blank line. */
	separator: string;
	/** Folder names as headings, a level deeper for each folder inside another. */
	folderHeadings: boolean;
	/** Each scene's name as a heading, under its folder's. */
	sceneHeadings: boolean;
	/** The binder's name as the first heading. */
	title: boolean;
	/** Leave out `%%comments%%` and HTML comments. */
	stripComments: boolean;
}

/** How a compile starts: the break between notes, headings for folders, no headings for scenes, a title, comments
    left out. */
export const COMPILE_DEFAULTS: CompileOptions = { separator: '* * *', folderHeadings: true, sceneHeadings: false, title: true, stripComments: true };

/** One thing to compile, in reading order: a folder's name (at its depth), or a scene's name and its text (without
    its properties: whoever read the note knows where they end). */
export type CompileItem = { kind: 'folder'; name: string; depth: number } | { kind: 'scene'; name: string; depth: number; text: string };

/** A binder as one Markdown text: properties left out, folders as headings, scenes one after another with the separator
    between those that follow each other, nothing else changed. */
export function compile(title: string, items: readonly CompileItem[], o: CompileOptions): string {
	const out: string[] = [], base = o.title ? 1 : 0, h = (level: number, text: string) => `${'#'.repeat(Math.max(1, Math.min(6, level)))} ${text}`;
	if (o.title) out.push(h(1, title));
	let last: 'folder' | 'scene' | null = null;
	const footnotes = new Set<string>();
	for (const it of items) {
		if (it.kind === 'folder') {
			if (o.folderHeadings) { out.push(h(base + it.depth + 1, it.name)); last = 'folder'; }
			else last = last === 'scene' ? 'scene' : null;
			continue;
		}
		let body = o.stripComments ? stripComments(it.text) : it.text;
		body = uniqueFootnotes(body.replace(/^\s*\n/, '').replace(/\s+$/, ''), footnotes);
		if (!body.trim() && !o.sceneHeadings) continue;
		if (o.sceneHeadings) out.push(h(base + (o.folderHeadings ? it.depth : 0) + 1, it.name));
		else if (last === 'scene' && o.separator.trim()) out.push(o.separator.trim());
		if (body.trim()) out.push(body);
		last = 'scene';
	}
	return out.join('\n\n') + (out.length ? '\n' : '');
}
