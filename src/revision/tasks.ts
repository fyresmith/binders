/* The revision note as text: which of its lines are tasks, what each is about, and the two things Binders ever
   writes to it (one item added at its end; one character between one item's brackets). Pure: no Obsidian here.
   Golden rule 3's fourth exception is these two functions; `docs/dev/file-format.md` ("Revision tasks") is the format.

   What a task is: a list item with a checkbox, anywhere in the note. A space between the brackets is unfinished and
   anything else is done, as Obsidian itself reads one. What it is about: the link that leads its line, as Binders
   writes it (`- [ ] [[Arrival]]: …`), and any other link on the line (the caller keeps the ones that name something in
   the binder). A task with no link of its own takes its parent item's, then the heading's it is under, so a writer
   who would rather keep a heading or a bullet per scene can. Indented `>` lines under a task are its quoted passage.
   A line that isn't a well-formed task is left alone by everything here: it is read as text, and never rewritten. */

export interface Link { path: string; lead: boolean }

export interface Task {
	/** The line it is on (from 0), and that line exactly as read: what a write checks before it changes anything. */
	line: number;
	raw: string;
	/** Where in the line the character between the brackets is. */
	markAt: number;
	done: boolean;
	/** The line as a reader sees it: no checkbox, no leading scene link, links as their names. */
	text: string;
	/** The links it is about: its own, or the nearest it is under. */
	links: Link[];
	quote: string | null;
}

const MARK = String.fromCharCode(0xFEFF);
const ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(?:\[(.)\][ \t]+)?(.*)$/;
const LINKS = /(!?)\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]|(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
const FENCE = /^\s*(```+|~~~+)/;
const width = (white: string): number => { let n = 0; for (const c of white) n += c === '\t' ? 4 : 1; return n; };
const linkPath = (target: string): string => target.split('#')[0].split('^')[0].trim();
const nameOf = (path: string): string => path.split('/').pop()?.replace(/\.md$/i, '') ?? path;

/** The links in a stretch of text, and the text with each shown as its name. */
function read(text: string): { links: Link[]; shown: string } {
	const links: Link[] = [];
	let lead = -1, end = 0;
	const shown = text.replace(LINKS, (all: string, bang: string, wiki: string | undefined, alias: string | undefined, bang2: string, label: string | undefined, href: string | undefined, at: number) => {
		if (bang || bang2) return all;
		let path = '', say = '';
		if (wiki != null) { path = linkPath(wiki); say = alias || nameOf(path); }
		else if (href != null && !/^[a-z][a-z0-9+.-]*:/i.test(href)) { try { path = linkPath(decodeURIComponent(href)).replace(/\.md$/i, ''); } catch { path = ''; } say = label || nameOf(path); }
		if (!path) return all;
		// (the links that lead the line, one after another: "[[A]], [[B]]: …" is about both)
		const first = at === 0 || !text.slice(0, at).trim() || (lead >= 0 && /^\s*(?:,|&|\+|and)?\s*$/.test(text.slice(end, at)));
		if (first) { lead = links.length; end = at + all.length; }
		links.push({ path, lead: first });
		return first ? '\u0000' : say;
	});
	// the link that leads the line is the group it is shown under, not part of what it says
	let out = shown;
	if (lead >= 0) { const rest = text.slice(end).replace(/^\s*[:–—-]?\s*/, ''); out = rest ? read(rest).shown : ''; }
	return { links, shown: out.trim() };
}

/** Where the note's text begins: after a block of properties that is closed (a rule at the top with no second rule
    is only text). */
function bodyStart(lines: string[]): number {
	if (lines[0]?.replace(MARK, '').trim() !== '---') return 0;
	for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return i + 1;
	return 0;
}

/** The tasks in a revision note, in the order they are written. */
export function parse(note: string): Task[] {
	const lines = note.split('\n'), out: Task[] = [];
	let i = bodyStart(lines), fence: string | null = null, heading: Link[] = [];
	const stack: { indent: number; links: Link[]; task: Task | null }[] = [];
	for (; i < lines.length; i++) {
		const raw = lines[i], line = raw.replace(/\r$/, '');
		const f = FENCE.exec(line);
		if (fence) { if (f && f[1].startsWith(fence) && f[1].length >= fence.length) fence = null; continue; }
		if (f) { fence = f[1]; continue; }
		const h = /^#{1,6}\s+(.*)$/.exec(line);
		if (h) { heading = read(h[1]).links; stack.length = 0; continue; }
		const m = ITEM.exec(line);
		if (!m) {
			const white = /^[ \t]*/.exec(line)?.[0] ?? '', top = stack[stack.length - 1];
			if (!line.trim()) continue; // (a blank line doesn't end a list item: a quote may follow one)
			if (top && width(white) > top.indent) {
				const q = /^[ \t]*>\s?(.*)$/.exec(line);
				if (q && top.task && q[1].trim()) top.task.quote = top.task.quote ? `${top.task.quote} ${q[1].trim()}` : q[1].trim();
				continue;
			}
			stack.length = 0; // (a paragraph: the list is over)
			continue;
		}
		const indent = width(m[1]);
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		const got = read(m[3]);
		let links = got.links;
		if (!links.length) { for (let s = stack.length - 1; s >= 0 && !links.length; s--) links = stack[s].links; if (!links.length) links = heading; if (links.length) links = links.map((l) => ({ ...l, lead: l.lead || links.length === 1 })); }
		let task: Task | null = null;
		if (m[2] != null) {
			task = { line: i, raw, markAt: raw.indexOf('[', m[1].length) + 1, done: m[2] !== ' ', text: got.shown, links, quote: null };
			out.push(task);
		}
		stack.push({ indent, links: got.links.length ? got.links : links, task });
	}
	return out;
}

/** A passage as it is kept under a task: one line, its white space settled, cut at a word if it is long. */
export function quoted(passage: string, max = 240): string {
	const one = passage.replace(/\s+/g, ' ').trim();
	if (one.length <= max) return one;
	const cut = one.slice(0, max), at = cut.lastIndexOf(' ');
	return `${cut.slice(0, at > max * 0.6 ? at : max).replace(/[\s,;:—-]+$/, '')}…`;
}

/** The lines a new task is: the item, and its passage under it if it has one. `link` is the scene's link as Obsidian
    writes one from this note (nothing for a task about the whole book). */
export function taskLines(link: string, text: string, passage = ''): string {
	const say = text.replace(/\s+/g, ' ').trim(), q = passage ? quoted(passage) : '';
	return `- [ ] ${link ? `${link}: ` : ''}${say}${q ? `\n\t> ${q}` : ''}`;
}

/** Does the note end inside a fenced block of code? (Anything added there would be code, not a task.) */
function endsInFence(note: string): boolean {
	let fence: string | null = null;
	for (const raw of note.split('\n').slice(bodyStart(note.split('\n')))) {
		const f = FENCE.exec(raw.replace(/\r$/, ''));
		if (fence) { if (f && f[1].startsWith(fence) && f[1].length >= fence.length) fence = null; } else if (f) fence = f[1];
	}
	return fence !== null;
}

/** The note with a task added at its end, in the note's own line ends. Nothing above it changes, not even a missing
    last line break (one is added after what is there, never in place of it). Null if the note ends in a block of code,
    where a task would not be one: the caller says so, and nothing is written. */
export function append(note: string, lines: string): string | null {
	if (endsInFence(note)) return null;
	const eol = note.includes('\r\n') ? '\r\n' : '\n', added = lines.replace(/\n/g, eol);
	if (!note.trim()) return `${note}${added}${eol}`;
	const body = note.replace(/(\r?\n)+$/, ''), tail = note.slice(body.length), breaks = (tail.match(/\n/g) ?? []).length;
	const last = body.slice(body.lastIndexOf('\n') + 1).replace(/\r$/, '');
	// (after something that isn't a list, a blank line, or the item would be read as part of that paragraph)
	const list = ITEM.test(last) || /^[ \t]+\S/.test(last);
	const gap = breaks >= 2 ? '' : breaks === 1 ? (list ? '' : eol) : (list ? eol : eol + eol);
	return `${note}${gap}${added}${eol}`;
}

/** The note with one task's box ticked or cleared: one character, and only if the line is still as it was read (or
    is, word for word, on exactly one other line: lines were added or taken away above it). Otherwise null: the caller
    says so, and nothing is written. */
export function setDone(note: string, task: Pick<Task, 'line' | 'raw' | 'markAt'>, done: boolean): string | null {
	const lines = note.split('\n');
	let at = lines[task.line] === task.raw ? task.line : -1;
	if (at < 0) { const same = lines.map((l, i) => (l === task.raw ? i : -1)).filter((i) => i >= 0); if (same.length === 1) at = same[0]; }
	if (at < 0) return null;
	const l = lines[at];
	if (l[task.markAt - 1] !== '[' || l[task.markAt + 1] !== ']') return null;
	lines[at] = l.slice(0, task.markAt) + (done ? 'x' : ' ') + l.slice(task.markAt + 1);
	return lines.join('\n');
}
