import type { BindersSettings } from '../settings-data';
import { STRUCTURES, type Structure } from '../export/model';
import { MATTER, NUMBER } from '../export/roles';
import { detect, type Choices, type Cut, type Found, type Level } from './detect';
import { escapeMarkdown } from './markdown';
import { inBinder, key, link, note, safeName, type ImportPlan, type PlannedNote } from './plan';
import { MAX_BYTES, MAX_FILES, TOO_BIG } from './source';
import type { Scan } from './text';

/* A text, as the binder it will be: every file import would write, with its bytes, before anything is written. Pure
   (the text is in hand, vault.ts writes the plan), so what it does is unit-tested (tests/import-manuscript.test.ts)
   and the dialog shows exactly what will be made. detect.ts says where chapters, parts and scenes start; this makes
   them notes and folders:
     - the pieces are cut out of the text where the units are, so they joined are the text, in order. What is not in
       them is the heading a chapter or part was named from, which is the name, and a mark between scenes that
       became a note boundary;
     - a chapter with one scene is a note at the top of the binder; with more it is a folder of notes. The binder
       note says which rule that makes (`structure`), so export doesn't have to guess;
     - everything before the first chapter is "Front matter";
     - a file chosen from the device is kept as it is in Research/Originals. A note already in the vault is not
       copied: the binder note links to it.
   The source is never changed. */

const enc = new TextEncoder();
const RESEARCH = 'Research', ORIGINALS = 'Originals', FRONT = 'Front matter';

export interface ManuscriptRead {
	/** The book's name as the file or note has it, without its ending. */
	name: string;
	/** The file's name, with its ending. */
	file: string;
	/** Where the text came from: a file chosen from the device (its bytes are kept), or a note of this vault (its path). */
	origin: { bytes: Uint8Array } | { path: string };
	scan: Scan;
}
export interface ManuscriptOptions {
	name: string;
	parent: string;
	settings: BindersSettings;
	choices: Partial<Choices>;
	/** Scenes are named by their first words, or "Scene 1", "Scene 2". */
	scenes: 'words' | 'numbers';
	/** What the writer has put right by hand, over what was found (it survives a change of any choice above). */
	edits?: Edits;
}

/** The writer's changes to the plan, kept over the detector's cuts so changing a choice doesn't throw them away: a cut
    made, changed or taken away at a unit, and a name for a row (by its key). */
export interface Edits { cuts: Map<number, Level | 'none'>; names: Map<number, string> }
export const noEdits = (): Edits => ({ cuts: new Map(), names: new Map() });
export type Action = { kind: 'join' } | { kind: 'make'; level: Level } | { kind: 'rename'; name: string } | { kind: 'start'; unit: number };
/** What can be done to a row. */
export function actionsFor(row: PlannedNote): ('join' | Level | 'rename')[] {
	const out: ('join' | Level | 'rename')[] = [];
	if (row.key === undefined) return out;
	if (row.at !== undefined && row.level) out.push('join');
	if (row.start !== undefined || row.at !== undefined) for (const l of ['chapter', 'scene', 'part'] as const) if (row.level !== l) out.push(l);
	out.push('rename');
	return out;
}
/** The edits after an action, as a new set: none of them can drop or repeat a word, since each only moves where the text is cut. */
export function applyAction(edits: Edits, row: PlannedNote, action: Action): Edits {
	const next: Edits = { cuts: new Map(edits.cuts), names: new Map(edits.names) };
	if (action.kind === 'join') { if (row.at !== undefined) next.cuts.set(row.at, 'none'); }
	else if (action.kind === 'make') { const at = row.at ?? row.start; if (at !== undefined) next.cuts.set(at, action.level); }
	else if (action.kind === 'start') next.cuts.set(action.unit, 'scene');
	else if (row.key !== undefined) { if (action.name.trim()) next.names.set(row.key, action.name.trim()); else next.names.delete(row.key); }
	return next;
}
/** The detector's cuts with the writer's put over them. A heading that stays a title leaves the text; one that becomes a
    scene stays in it (a scene is named by its first words), so no change drops a word. */
function applyEdits(found: Cut[], units: readonly { heading: number | null; text: string; raw?: string }[], edits: Edits | undefined): Cut[] {
	if (!edits || !edits.cuts.size) return found;
	const out = new Map(found.map((c) => [c.at, c]));
	for (const [i, v] of edits.cuts) {
		const u = units[i];
		if (!u) continue;
		if (v === 'none') { out.delete(i); continue; }
		const old = out.get(i), titled = v !== 'scene' && (u.heading !== null || old?.by === 'title' || old?.by === 'page');
		const marker = old?.by === 'break' && old.drop;
		out.set(i, { at: i, level: v, by: old?.by ?? 'break', title: titled ? (old && old.by !== 'break' && old.title ? old.title : u.heading !== null ? u.text.trim() : (u.raw ?? u.text).trim()) : '', drop: titled || marker });
	}
	return [...out.values()].sort((a, b) => a.at - b.at);
}

const tokensOf = (s: string): string => (s.normalize('NFC').match(/[\p{L}\p{N}\p{M}]+/gu) ?? []).join(' ').toLowerCase();
const SMALL = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'by', 'or', 'but', 'with']);
/** A heading in capitals as a title: "THE STORM" is "The Storm". Roman numerals after Chapter or Part stay as they are. */
function titleCase(s: string): string {
	if (!/\p{L}/u.test(s) || s !== s.toUpperCase() || s === s.toLowerCase()) return s;
	return s.toLowerCase().replace(/[\p{L}\p{N}’']+/gu, (w, at: number, all: string) => {
		const before = /(chapter|part|book|act)\s+$/i.test(all.slice(0, at));
		if (before && /^[ivxlcdm]+$/i.test(w)) return w.toUpperCase();
		return at > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1);
	});
}
const NUMBERED_COLON = new RegExp(`^((?:chapter|part|book|act)\\s+${NUMBER})\\s*[-–—:.)]\\s*(\\S.*)$`, 'i');
/** A heading as a name: its marks off, a number followed by its title as "Chapter 12 - The Storm" (export strips a
    number only when a separator follows it), and capitals made a title's. */
export function nameOf(raw: string): string {
	let t = raw.replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1');
	t = t.replace(/\*+|~~|==|`+/g, '').replace(/(^|[\s(])_+|_+(?=[\s).,;:!?]|$)/g, '$1').replace(/\s+/g, ' ').trim();
	t = t.replace(NUMBERED_COLON, '$1 - $2');
	return titleCase(t);
}
/** The first words of a text, for a scene's name: about forty characters, at a word's end. */
export function firstWords(text: string, max = 40): string {
	const t = nameOf(text).replace(/^[#>\-+\s]+/, '');
	if (t.length <= max) return t.replace(/[\s,;:–—-]+$/, '');
	const cut = t.slice(0, max + 1), at = cut.lastIndexOf(' ');
	return (at > max / 2 ? cut.slice(0, at) : cut.slice(0, max)).replace(/[\s,;:–—-]+$/, '');
}

interface Scene { from: number; to: number; at?: number }
/** `heading`: null for one the writer made at a paragraph (named by its first words), "" for a numbered heading with no text. */
interface Chapter { title: string; heading: string | null; scenes: Scene[]; at?: number }
interface Part { title: string; heading: string | null; own: Scene | null; chapters: Chapter[]; at: number }

export function planManuscript(read: ManuscriptRead, o: ManuscriptOptions): { plan: ImportPlan; found: Found; title: string | null } {
	const { scan } = read, { units, text } = scan;
	const name = safeName(o.name), root = o.parent ? `${o.parent}/${name}` : name;
	const research = `${root}/${RESEARCH}`, researchNote = `${research}/${RESEARCH}.md`, originals = `${research}/${ORIGINALS}`, binderNote = `${root}/${name}.md`;
	const plan: ImportPlan = { name, files: new Map(), folders: [], notes: [], warnings: [], said: [], labels: [], statuses: [], sceneCount: 0, snapshotCount: 0, trashCount: 0 };
	const { found, cuts: detected } = detect(units, o.choices);
	const cuts = applyEdits(detected, units, o.edits);

	// ---- what is said ----
	const lines = new Set<string>(), about: { path: string; name: string; text: string }[] = [];
	const warn = (title: string, said: string, path = '') => {
		const line = title ? `${title}: ${said}` : said;
		if (lines.has(line)) return;
		lines.add(line);
		about.push({ path, name: title || read.file, text: said });
	};
	for (const s of scan.said) warn('', s);
	if (scan.skipped) warn('', 'The note’s properties, the block at its top, aren’t brought in. The original keeps them.');
	if (/^\[\^[^\]\s]+\]:/m.test(text)) warn('', 'This text has footnotes written out at its foot. They stay together at the foot of the last note, and a note that marks one no longer finds it. Move each beside the note that marks it.');
	if (/^ {0,3}\[[^\]\n]+\]:[ \t]+\S/m.test(text)) warn('', 'This text has links defined at its foot. They stay at the foot of the last note, and a link that uses one in an earlier note no longer finds it.');
	if (/\[\[#[^\]]/.test(text)) warn('', 'A link to a heading of this text, such as [[#Chapter 1]], finds no heading now that the headings are names.');

	// ---- the files to make ----
	const unsafe = () => new Error('A name in the text can’t be made into a file’s name. Nothing was imported.');
	const folders = new Set<string>();
	const folder = (path: string) => { if (!inBinder(root, path)) throw unsafe(); folders.add(path); };
	let outputBytes = 0;
	const put = (path: string, data: string | Uint8Array) => {
		if (!inBinder(root, path)) throw unsafe();
		if (plan.files.has(path)) throw new Error('Two imported files have the same path.');
		const bytes = typeof data === 'string' ? enc.encode(data) : data;
		outputBytes += bytes.length;
		if (outputBytes > MAX_BYTES || plan.files.size >= MAX_FILES) throw new Error(TOO_BIG);
		plan.files.set(path, bytes);
	};
	const used = new Set<string>();
	const reserve = (path: string) => used.add(key(path.replace(/\.md$/i, '')));
	const fresh = (parent: string, title: string): string => {
		let stem = safeName(title);
		while (/\.md$/i.test(stem)) stem = safeName(stem.slice(0, -3));
		let n = stem;
		for (let i = 2; used.has(key(`${parent}/${n}`)); i++) n = `${stem} ${i}`;
		reserve(`${parent}/${n}`);
		return `${parent}/${n}`;
	};
	folder(root);
	for (const taken of [`${root}/${name}`, `${root}/Snapshots`, research]) reserve(taken);
	const rel = (path: string) => path.slice(root.length + 1).replace(/\.md$/i, '');
	const contentsList: string[] = [], order: string[] = [];

	/** The text of units [from, to), as it stands in the source: its own bytes, from the first unit to the last. */
	const piece = (s: Scene): string => {
		if (s.from >= s.to) return '';
		const body = text.slice(units[s.from].start, units[s.to - 1].end).trim() ? text.slice(units[s.from].start, units[s.to - 1].end).replace(/\s+$/, '') : '';
		return body ? `${body}\n` : '';
	};
	const has = (s: Scene): boolean => piece(s) !== '';

	interface Meta { at?: number; start?: number; key?: number; level?: 'part' | 'chapter' | 'scene'; units?: [number, number]; prefix?: string }
	const makeNote = (path: string, title: string, body: string, isFolder: boolean, heading?: string, meta: Meta = {}) => {
		put(path, note({}, body));
		const row: PlannedNote = { path, title, body, folder: isFolder, depth: path.slice(root.length + 1).split('/').length - (isFolder ? 1 : 0), out: false, status: '' };
		if (heading) row.heading = heading;
		for (const [k, v] of Object.entries(meta)) if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
		plan.notes.push(row);
		if (!isFolder) plan.sceneCount++;
	};
	const renamed = (k: number): string | undefined => o.edits?.names.get(k);
	/** What a note's own text is, in units: it is where it is cut from, trimmed of what is not text. */
	const unitsOf = (s: Scene): [number, number] | undefined => (piece(s) ? [s.from, s.to] : undefined);

	/** A chapter's or part's name, from the writer's, else from its heading; and whether the heading is its words or has to
	    be kept (a note starts with it as a line, a folder's first note does). */
	const titled = (parent: string, heading: string | null, fallback: string, k: number) => {
		const mine = renamed(k);
		const wanted = mine ?? (heading === null ? fallback : nameOf(heading) || fallback);
		const path = fresh(parent, wanted), made = path.split('/').pop() ?? '';
		if (heading !== null && heading.trim() === '' && mine === undefined) warn(made, 'Its heading is numbered by the file and has no text, so it is named by its place.');
		return { path, made, differs: heading !== null && heading.trim() !== '' && tokensOf(made) !== tokensOf(heading) };
	};

	// ---- the structure of the text ----
	const sentinel = units.length;
	const tops: (Part | Chapter)[] = [];
	let front: Scene | null = null, one: Scene | null = null, scenesOnly: Chapter | null = null;
	let part: Part | null = null, chapter: Chapter | null = null;
	const stops = cuts.filter((c) => c.level !== 'scene');
	if (!cuts.length) one = { from: 0, to: sentinel };
	else {
		if (!stops.length) {
			scenesOnly = { title: 'Chapter 1', heading: null, scenes: [{ from: 0, to: cuts[0].at }] };
			chapter = scenesOnly;
			tops.push(scenesOnly);
		} else front = { from: 0, to: stops[0].at };
		cuts.forEach((cut: Cut, k) => {
			if (front && cut.at < front.to) return;
			const range: Scene = { from: cut.at + (cut.drop ? 1 : 0), to: cuts[k + 1]?.at ?? sentinel };
			const blank = !(cut.drop && (cut.title !== '' || cut.by === 'heading'));
			// (a scene the writer made after a part and before any chapter is a chapter of that part: nothing is left out of the plan)
			const level = cut.level === 'scene' && !chapter && part ? 'chapter' : cut.level;
			if (level === 'part') {
				part = { title: cut.title, heading: blank ? null : cut.title, own: has(range) ? range : null, chapters: [], at: cut.at };
				tops.push(part);
				chapter = null;
			} else if (level === 'chapter') {
				chapter = { title: cut.title, heading: blank ? null : cut.title, scenes: [range], at: cut.at };
				(part ? part.chapters : tops).push(chapter);
			} else if (chapter) chapter.scenes.push({ ...range, at: cut.at });
		});
	}
	// a chapter is the scenes that have text; one with none is one empty note
	for (const c of [...tops, ...tops.flatMap((t) => ('chapters' in t ? t.chapters : []))]) if ('scenes' in c) { const kept = c.scenes.filter(has); c.scenes = kept.length ? kept : [c.scenes[0]]; }

	// ---- the notes ----
	let numbered = 0, partNo = 0;
	const chapterFolders = { any: false };
	const sceneKey = (s: Scene): number => s.at ?? -1 - s.from;
	const firstOf = (s: Scene): string => { for (let u = s.from; u < s.to; u++) if (units[u].words) return firstWords(text.slice(units[u].start, units[u].end)); return ''; };
	const sceneName = (s: Scene, i: number): string => renamed(sceneKey(s)) ?? ((o.scenes === 'words' && firstOf(s)) || `Scene ${i + 1}`);
	const emitChapter = (c: Chapter, parent: string) => {
		const n = ++numbered, many = c.scenes.length > 1, k = c.at ?? -1000000;
		const t = titled(parent, c.heading, (c !== scenesOnly && c.heading === null && firstOf(c.scenes[0])) || `Chapter ${n}`, k);
		const head = c.heading?.trim() ? c.heading : undefined, first = c.scenes[0];
		if (!many) {
			const body = piece(first), prefix = t.differs && head ? `# ${head}\n\n` : '';
			const path = `${t.path}.md`;
			makeNote(path, t.made, prefix + body, false, head, { at: c.at, start: first.from, key: k, level: 'chapter', units: unitsOf(first), prefix });
			contentsList.push(rel(path));
			order.push(path);
			return;
		}
		chapterFolders.any = true;
		folder(t.path);
		const folderNote = `${t.path}/${t.made}.md`;
		reserve(folderNote);
		order.push(folderNote);
		contentsList.push(`${rel(t.path)}/`);
		// (a heading that isn't the folder's name is the first line of its first note: a folder has no text of its own)
		if (t.differs && head) warn(head, `Its heading can’t be a folder’s name as it is, so the folder is called “${t.made}”, and the heading is the first line of the first note in it.`);
		makeNote(folderNote, t.made, '', true, t.differs ? undefined : head, { at: c.at, start: first.from, key: k, level: 'chapter' });
		c.scenes.forEach((s, i) => {
			const path = `${fresh(t.path, sceneName(s, i))}.md`, prefix = i === 0 && t.differs && head ? `# ${head}\n\n` : '';
			makeNote(path, path.split('/').pop()?.replace(/\.md$/i, '') ?? '', prefix + piece(s), false, prefix ? head : undefined, { at: s.at, start: s.from, key: sceneKey(s), level: 'scene', units: unitsOf(s), prefix });
			contentsList.push(rel(path));
			order.push(path);
		});
	};

	if (one) {
		const path = `${fresh(root, 'Manuscript')}.md`;
		makeNote(path, 'Manuscript', piece(one), false, undefined, { start: one.from, key: sceneKey(one), units: unitsOf(one) });
		contentsList.push(rel(path));
		order.push(path);
		warn('', 'No chapters were found. Everything comes in as one note. Split it where you like with Split scene at cursor.');
	} else if (!stops.length) {
		warn('', `No chapters were found. The ${cuts.length + 1} scenes are in one folder, “Chapter 1”, and you can rename or split it.`);
	}

	// front matter: a folder the book's front in, cut at the headings that name front matter, and where the writer cut it
	if (front && front.to > front.from) {
		const end = front.to;
		const named = (i: number) => units[i].heading !== null && MATTER.test(nameOf(units[i].text));
		const marks = new Set<number>([front.from]);
		for (let i = front.from; i < end; i++) if (named(i)) marks.add(i);
		for (const c of cuts) if (c.at < end) marks.add(c.at);
		const starts = [...marks].sort((a, b) => a - b);
		const parts = starts.map((from, i) => {
			const cutHere = cuts.find((c) => c.at === from), heading = named(from) ? units[from].text : undefined;
			const scene: Scene = { from: heading ? from + 1 : from, to: starts[i + 1] ?? end, at: cutHere?.at };
			return { scene, title: heading ? nameOf(heading) : i === 0 ? 'Title page' : '', heading, at: cutHere?.at, from };
		}).filter((q) => has(q.scene) || q.heading);
		if (parts.length) {
			const dir = `${root}/${FRONT}`;
			folder(dir);
			reserve(dir);
			const folderNote = `${dir}/${FRONT}.md`;
			reserve(folderNote);
			order.push(folderNote);
			contentsList.push(`${FRONT}/`);
			makeNote(folderNote, FRONT, '', true);
			for (const q of parts) {
				const k = q.at ?? -1 - q.scene.from;
				const path = `${fresh(dir, renamed(k) ?? (q.title || firstOf(q.scene) || 'Front matter'))}.md`;
				makeNote(path, path.split('/').pop()?.replace(/\.md$/i, '') ?? q.title, piece(q.scene), false, q.heading, { at: q.at, start: q.scene.from, key: k, units: unitsOf(q.scene) });
				contentsList.push(rel(path));
				order.push(path);
			}
		}
	}

	if (scenesOnly) emitChapter(scenesOnly, root);
	else for (const t of tops) {
		if (!('chapters' in t)) { emitChapter(t, root); continue; }
		const n = titled(root, t.heading, `Part ${++partNo}`, t.at);
		const head = t.heading?.trim() ? t.heading : undefined;
		folder(n.path);
		const folderNote = `${n.path}/${n.made}.md`;
		reserve(folderNote);
		order.push(folderNote);
		contentsList.push(`${rel(n.path)}/`);
		makeNote(folderNote, n.made, '', true, n.differs ? undefined : head, { at: t.at, start: t.own?.from, key: t.at, level: 'part' });
		if (t.own || (n.differs && head)) {
			const path = `${fresh(n.path, `${n.made} text`)}.md`, prefix = n.differs && head ? `# ${head}\n\n` : '';
			makeNote(path, path.split('/').pop()?.replace(/\.md$/i, '') ?? '', prefix + (t.own ? piece(t.own) : ''), false, prefix ? head : undefined, { start: t.own?.from, key: t.own ? -1 - t.own.from : -2000000 - t.at, units: t.own ? unitsOf(t.own) : undefined, prefix });
			contentsList.push(rel(path));
			order.push(path);
			if (t.own) warn(t.heading ?? n.made, 'It has text of its own, which is the first note in its folder here.', path);
		}
		for (const c of t.chapters) emitChapter(c, n.path);
	}
	const hasParts = tops.some((t) => 'chapters' in t);
	const structure: Structure = hasParts ? (chapterFolders.any ? 'parts-chapters' : 'parts') : chapterFolders.any ? 'chapters' : 'notes';

	// ---- the original, and the binder note ----
	if ('bytes' in read.origin) {
		folder(research);
		folder(originals);
		// (a note kept under its own ending would be a note of the binder, its writing twice: the ending is changed, the bytes are not)
		const file = safeName(read.file).replace(/\.(md|markdown)$/i, '$&.original');
		put(`${originals}/${file}`, read.origin.bytes);
		put(researchNote, note({ export: false }, ''));
		plan.notes.push({ path: researchNote, title: RESEARCH, body: '', folder: true, depth: 1, out: true, status: '' });
		order.push(researchNote);
		contentsList.push(`${RESEARCH}/`);
	}
	if (found.doubtful) warn('', 'These may not be chapters. Look at the list.');
	plan.warnings = [...lines];
	plan.said = about;
	const from = 'bytes' in read.origin ? `Imported from “${escapeMarkdown(read.file)}”. The file is kept as it was in ${RESEARCH}/${ORIGINALS}.` : `Made from ${link(read.origin.path, read.name)}. That note is unchanged.`;
	const report = `${from}\n\n${plan.warnings.length ? `## Import notes\n\n${plan.warnings.map((w) => `- ${escapeMarkdown(w)}`).join('\n')}\n` : ''}`;
	makeNote(binderNote, name, '', true);
	plan.files.delete(binderNote);
	put(binderNote, note({ binder: 1, contents: contentsList, structure: STRUCTURES[structure][0] }, report));
	// the rows as the binder will list them: the binder's own first, and the folders outermost first as they have to be made
	const sequence = new Map([...new Set([binderNote, ...order])].map((p, i) => [p, i]));
	plan.notes.sort((a, b) => (sequence.get(a.path) ?? Infinity) - (sequence.get(b.path) ?? Infinity));
	plan.folders = [...folders].sort((a, b) => a.split('/').length - b.split('/').length);
	const book = found.book === null ? null : nameOf(units[found.book].text);
	return { plan, found, title: book };
}
