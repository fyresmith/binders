import { needs, parseBody, parseNote, type Parsed } from './markdown';
import { inlines, plain, type Block, type Book, type Matter, type Picture, type Section, type Structure, type Warning } from './model';
import { isPictureName } from './picture';
import { UNNUMBERED, assignRoles, guessStructure, readRole, titleFrom, type SourceItem } from './roles';
import { typesetBlocks } from './typography';

/* A binder put together as a book: every included note read (markdown.ts), given its role (roles.ts), and joined
   into the sections a writer sets, with what was embedded brought in and what couldn't be said as a warning. Pure:
   the notes' text and the files they embed are handed in. */

export interface BookOptions {
	title: string;
	subtitle?: string;
	author: string;
	/** The copyright line. Without it, and with an author, it is "© year author". */
	copyright?: string;
	/** The year a made copyright line says. */
	year?: number;
	cover?: Picture | null;
	/** The pages Binders makes for a book (an ebook, the pages): asked for by being given, each on unless said. A
	    manuscript has its own title page and asks for none. `contents`: a contents page always, never, or (when not
	    said) when a chapter has a title. */
	made?: { titlePage?: boolean; copyright?: boolean; contents?: Contents };
	/** A language tag; English when not said. */
	language?: string;
	/** The structure rule; guessed from the binder's shape when not said. */
	structure?: Structure | null;
	/** Front and back matter in the book (a manuscript leaves them out unless asked). */
	matter: boolean;
	/** Quotes, dashes and ellipses typeset (the default), or as typed. */
	asTyped?: boolean;
	/** A Longform project: a flat list, every note a chapter. */
	flat?: boolean;
}

export type Contents = 'always' | 'titled' | 'never';

/** What a note embeds or shows, found and read beforehand: by the name the note uses, from the note at `from`. */
export interface Resolver {
	embed?(target: string, from: string): { text: string } | { picture: Picture } | null;
	image?(src: string, from: string): Picture | null;
	/** The note a link leads to, as its path in the vault; null when there is none. */
	link?(target: string, from: string): string | null;
}

const MATTERS: [RegExp, Matter][] = [[/^title page$/i, 'title-page'], [/^copyright$/i, 'copyright'], [/^dedication$/i, 'dedication'], [/^epigraph$/i, 'epigraph'], [/^acknowledge?ments$/i, 'acknowledgements'], [/^about the author$/i, 'about-the-author'], [/^also by\b/i, 'also-by']];
/** Which page of front or back matter a name says it is. */
export const matterOf = (name: string): Matter | undefined => MATTERS.find(([re]) => re.test(name.trim()))?.[1];

/** A name as an id: its letters and digits in lower case, without their accents, joined by hyphens. */
const slug = (name: string): string => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const said = (n: string) => n.split('|')[0].trim();

export function buildBook(items: readonly SourceItem[], o: BookOptions, resolve: Resolver = {}): Book {
	const structure = o.structure ?? (o.flat ? 'notes' : guessStructure(items)), language = o.language || 'en';
	const { placed, deep } = assignRoles(items, structure);
	const book: Book = { title: o.title, subtitle: o.subtitle?.trim() ?? '', author: o.author, copyright: '', cover: o.cover ?? null, language, structure, guessed: !o.structure, sections: [], notes: [], warnings: [], outline: [] };
	const warn = (item: SourceItem, text: string) => { if (!book.warnings.some((w) => w.path === item.path && w.text === text)) book.warnings.push({ path: item.path, name: item.name, text }); };
	for (const f of deep) warn(f, 'This folder is deeper than the book’s structure reaches: it only groups its notes.');

	/** A note's blocks as the book has them: what it embeds brought in, its footnotes numbered with the book's. */
	const read = (item: SourceItem): Block[] => {
		const parsed = parseBody(item.text ?? '');
		for (const w of parsed.warnings) warn(item, w);
		return settle(parsed, item, true);
	};
	/** Links to notes, until the sections have their ids: the run, and the path of the note it leads to. */
	const links: { run: { at?: string }; path: string }[] = [];
	const found = (blocks: readonly Block[], from: string) => {
		if (!resolve.link) return;
		for (const runs of inlines(blocks)) for (const r of runs) if (r.kind === 'text' && r.to !== undefined) { const path = resolve.link(r.to, from); if (path) links.push({ run: r, path }); }
	};
	const settle = (parsed: Parsed, item: SourceItem, outer: boolean): Block[] => {
		const at = book.notes.length;
		parsed.notes.forEach(() => book.notes.push([]));
		// (a footnote's mark is its place among the book's footnotes: set before anything embedded, with marks of its own, is brought in)
		if (at) for (const list of [parsed.blocks, ...parsed.notes]) for (const runs of inlines(list)) for (let i = 0; i < runs.length; i++) { const r = runs[i]; if (r.kind === 'note') runs[i] = { kind: 'note', note: r.note + at }; }
		const fill = (blocks: Block[]): Block[] => blocks.flatMap((b): Block[] => {
			if (b.kind === 'quote') return [{ ...b, blocks: fill(b.blocks) }];
			if (b.kind === 'list') return [{ ...b, items: b.items.map(fill) }];
			if (b.kind === 'image') {
				const picture = /^[a-z][\w+.-]*:/i.test(b.src) ? null : resolve.image?.(b.src, item.path) ?? null;
				if (picture) return [{ ...b, picture }];
				warn(item, /^[a-z][\w+.-]*:/i.test(b.src) ? `The picture “${b.src}” is on the web, not in the vault. It’s left out.` : `The picture “${b.src}” isn’t in the vault, or isn’t a PNG, JPEG or GIF. It’s left out.`);
				return [];
			}
			if (b.kind !== 'embed') return [b];
			const name = said(b.target), found = resolve.embed?.(b.target, item.path) ?? null;
			if (found && 'picture' in found) return [{ kind: 'image', src: name, alt: '', picture: found.picture }];
			if (found && 'text' in found && outer) {
				const inner = parseNote(found.text);
				for (const w of inner.warnings) warn(item, w);
				return settle(inner, item, false);
			}
			warn(item, found ? `“${name}” is embedded in a note that is itself embedded. It’s left out.`
				: isPictureName(name) ? `The picture “${name}” isn’t in the vault, or isn’t a PNG, JPEG or GIF. It’s left out.`
				: `“${name}” is embedded, and isn’t a note or a picture that can be exported. It’s left out.`);
			return [];
		});
		found(parsed.blocks, item.path);
		for (const n of parsed.notes) found(n, item.path);
		const blocks = fill(parsed.blocks);
		parsed.notes.forEach((n, i) => { book.notes[at + i] = fill(n); });
		return blocks;
	};

	let parts = 0, chapters = 0, open: Section | null = null;
	const begin = (role: Section['role'], item: SourceItem | null, blocks: Block[]): Section => {
		let title = item ? titleFrom(item.name) : '';
		// a level-one heading at the top of a note is its title, and isn't set twice
		const first = blocks[0];
		if (item?.kind === 'note' && first?.kind === 'heading' && first.level === 1) { title = plain(first.runs).trim(); blocks = blocks.slice(1); }
		const numbered = role === 'part' || (role === 'chapter' && !UNNUMBERED.test(title));
		const s: Section = { id: '', role, number: !numbered ? null : role === 'part' ? ++parts : ++chapters, title: role === 'front' || role === 'back' ? title || (item?.name ?? '') : title, blocks: [], paths: item ? [item.path] : [] };
		if (item && (role === 'front' || role === 'back')) { const m = matterOf(item.name); if (m) s.matter = m; }
		add(s, blocks);
		book.sections.push(s);
		return s;
	};
	/** More text for a section: after a scene break, if it has text already. */
	const add = (s: Section, blocks: Block[]) => {
		const kept = trimBreaks(blocks);
		if (!kept.length) return;
		if (s.blocks.length) s.blocks.push({ kind: 'break' });
		s.blocks.push(...kept);
	};
	for (const p of placed) {
		const { item, role } = p;
		let number: number | null = null;
		if (role === 'out' || role === 'group') { /* nothing of its own */ }
		else if (role === 'front' || role === 'back') { if (item.kind === 'note' && o.matter) begin(role, item, read(item)); if (item.kind === 'note') open = null; }
		else if (role === 'scene') {
			if (item.kind === 'note') {
				if (!open) open = begin('chapter', null, []);
				open.paths.push(item.path);
				add(open, read(item));
			}
		} else {
			const s = begin(role, item, item.kind === 'note' ? read(item) : []);
			number = s.number;
			open = role === 'chapter' ? s : null;
		}
		book.outline.push({ name: item.name, path: item.path, depth: p.depth, folder: item.kind === 'folder', role, auto: p.auto, said: readRole(item.exportAs), number });
	}
	renumber(book);
	book.copyright = (o.copyright?.trim() || (o.author.trim() ? `© ${o.year ?? new Date().getFullYear()} ${o.author.trim()}` : '')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l).join('\n');
	if (o.made) makePages(book, o.made);
	name(book);
	// a link to a note of the book leads to the section that note is in
	const at = new Map<string, string>();
	for (const s of book.sections) for (const path of s.paths) if (!at.has(path)) at.set(path, s.id);
	for (const l of links) { const id = at.get(l.path); if (id) l.run.at = id; }
	if (!o.asTyped) { for (const s of book.sections) typesetBlocks(s.blocks, language); for (const n of book.notes) typesetBlocks(n, language); }
	return book;
}

/** The pages Binders makes, put where a book has them: the title page first and the copyright page after it, then
    the book's own front matter, then the contents. A note of the book that is one of them takes the made one's place. */
function makePages(book: Book, o: NonNullable<BookOptions['made']>): void {
	const has = (m: Matter) => book.sections.some((s) => s.matter === m);
	const page = (matter: Matter, blocks: Block[] = []): Section => ({ id: '', role: 'front', matter, made: true, number: null, title: '', blocks, paths: [] });
	const lead: Section[] = [];
	if (o.titlePage !== false && !has('title-page')) lead.push(page('title-page'));
	if (o.copyright !== false && book.copyright && !has('copyright')) lead.push(page('copyright', book.copyright.split('\n').map((l): Block => ({ kind: 'p', runs: [{ kind: 'text', text: l }] }))));
	const contents = o.contents ?? 'titled';
	const listed = contents === 'always' || (contents === 'titled' && book.sections.some((s) => s.role === 'chapter' && s.title));
	book.sections.unshift(...lead);
	if (listed) { let i = 0; while (i < book.sections.length && book.sections[i].role === 'front') i++; book.sections.splice(i, 0, page('contents')); }
}

/** Every section given its id: a part's or a chapter's number, or its name, or what it is; never the same twice. */
function name(book: Book): void {
	const used = new Set<string>();
	for (const s of book.sections) {
		const base = s.number != null ? `${s.role}-${s.number}` : s.matter ?? (slug(s.title) || s.role);
		let id = /^[a-z]/.test(base) ? base : `${s.role}-${base}`;
		for (let n = 2, root = id; used.has(id); n++) id = `${root}-${n}`;
		used.add(id);
		s.id = id;
	}
}

/** The book's footnotes put in the order their marks come in the text (a note embedded early brings its footnotes
    in late), and those no mark leads to any more dropped. */
function renumber(book: Book): void {
	const order: number[] = [], seen = new Set<number>();
	const visit = (blocks: readonly Block[]) => {
		for (const runs of inlines(blocks)) for (const r of runs) {
			if (r.kind !== 'note' || seen.has(r.note) || !book.notes[r.note]) continue;
			seen.add(r.note);
			order.push(r.note);
			visit(book.notes[r.note]);
		}
	};
	for (const s of book.sections) visit(s.blocks);
	if (order.length === book.notes.length && order.every((n, i) => n === i)) return;
	const at = new Map(order.map((old, now) => [old, now] as const)), notes = order.map((old) => book.notes[old]);
	for (const list of [...book.sections.map((s) => s.blocks), ...notes]) for (const runs of inlines(list)) for (let i = 0; i < runs.length; i++) { const r = runs[i]; if (r.kind === 'note') runs[i] = { kind: 'note', note: at.get(r.note) ?? -1 }; }
	book.notes = notes;
}

/** Blocks without scene breaks at their ends or two in a row: a break is between two stretches of text. */
function trimBreaks(blocks: Block[]): Block[] {
	const out: Block[] = [];
	for (const b of blocks) if (b.kind !== 'break' || (out.length && out[out.length - 1].kind !== 'break')) out.push(b);
	while (out.length && out[out.length - 1].kind === 'break') out.pop();
	return out;
}

/** What the notes of a binder embed and show, by the note that does: what a reader must fetch before `buildBook`. */
export function bookNeeds(items: readonly SourceItem[]): { from: string; embeds: string[]; images: string[] }[] {
	const out: { from: string; embeds: string[]; images: string[] }[] = [];
	const walk = (list: readonly SourceItem[]) => {
		for (const it of list) {
			if (!it.included) continue;
			if (it.kind === 'folder') { walk(it.children ?? []); continue; }
			const n = needs(parseBody(it.text ?? ''));
			if (n.embeds.length || n.images.length) out.push({ from: it.path, ...n });
		}
	};
	walk(items);
	return out;
}

export type { Warning };
