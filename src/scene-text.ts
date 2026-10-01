/* The text side of working with scenes: where a note's properties end and its text begins, splitting a note in two,
   joining notes, a synopsis from a note's opening, names for new notes, and compiling a binder into one text. Pure, so
   every rule here is unit-tested: these are the places writing could be lost. */

/** A note as its properties block (with its `---` lines and the line break after, or "") and the text after it. */
export function parts(text: string): { front: string; body: string } {
	// (an empty block, `---` straight after `---`, is one too: without it the "properties" would run on to the next
	// rule in the text, and that text would be taken for properties)
	const m = /^---\r?\n(?:[\s\S]*?\r?\n)??---[ \t]*(?:\r?\n|$)/.exec(text);
	return m ? { front: m[0], body: text.slice(m[0].length) } : { front: '', body: text };
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
    is. Only the note changes: the part, the shown text and the kind of link stay. Code is left alone. */
export function repointLinks(text: string, to: (path: string, subpath: string) => string | null): string {
	const re = new RegExp(CODE + '|(!?\\[\\[)([^\\]|#\\n]*)(#[^\\]|\\n]*)?((?:\\|[^\\]\\n]*)?\\]\\])|(!?\\[[^\\]\\n]*\\]\\()(<[^>\\n]*>|[^)\\s]*)(\\))', 'gm');
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
	for (let n = m?.[2] ? Number(m[2]) + 1 : 2; ; n++) { const next = `${base} ${n}`; if (!taken(next)) return next; }
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
