import type { BindersSettings } from '../settings-data';
import { STRUCTURES, type Structure } from '../export/model';
import { MATTER, NUMBER } from '../export/roles';
import { detect, type Choices, type Cut, type Found } from './detect';
import { escapeMarkdown } from './markdown';
import { inBinder, key, link, note, safeName, type ImportPlan } from './plan';
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

interface Scene { from: number; to: number }
interface Chapter { title: string; heading: string | null; scenes: Scene[] }
interface Part { title: string; heading: string; own: Scene | null; chapters: Chapter[] }

export function planManuscript(read: ManuscriptRead, o: ManuscriptOptions): { plan: ImportPlan; found: Found; title: string | null } {
	const { scan } = read, { units, text } = scan;
	const name = safeName(o.name), root = o.parent ? `${o.parent}/${name}` : name;
	const research = `${root}/${RESEARCH}`, researchNote = `${research}/${RESEARCH}.md`, originals = `${research}/${ORIGINALS}`, binderNote = `${root}/${name}.md`;
	const plan: ImportPlan = { name, files: new Map(), folders: [], notes: [], warnings: [], said: [], labels: [], statuses: [], sceneCount: 0, snapshotCount: 0, trashCount: 0 };
	const { found, cuts } = detect(units, o.choices);

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

	const makeNote = (path: string, title: string, body: string, isFolder: boolean, heading?: string) => {
		put(path, note({}, body));
		plan.notes.push({ path, title, body, folder: isFolder, depth: path.slice(root.length + 1).split('/').length - (isFolder ? 1 : 0), out: false, status: '', ...(heading !== undefined ? { heading } : {}) });
		if (!isFolder) plan.sceneCount++;
	};

	/** A chapter's or part's name from its heading, and whether the heading has to be kept in the note's text. */
	const titled = (parent: string, heading: string | null, fallback: string, isFolder: boolean) => {
		const wanted = heading === null ? fallback : nameOf(heading) || fallback;
		const path = fresh(parent, wanted), made = path.split('/').pop() ?? '';
		// (the name is the heading's words: when it isn't, a note shows the heading as its first line and a folder says so)
		const differs = heading !== null && tokensOf(made) !== tokensOf(heading);
		if (differs && isFolder) warn(heading, `Its heading can’t be a folder’s name as it is, so the folder is called “${made}”.`);
		return { path, made, differs: differs && !isFolder };
	};

	// ---- the structure of the text ----
	const sentinel = units.length;
	const tops: (Part | Chapter)[] = [];
	let front: Scene | null = null, one: Scene | null = null, scenesOnly: Chapter | null = null;
	let part: Part | null = null, chapter: Chapter | null = null;
	if (!cuts.length) one = { from: 0, to: sentinel };
	else {
		if (found.signal === 'none') {
			scenesOnly = { title: 'Chapter 1', heading: null, scenes: [{ from: 0, to: cuts[0].at }] };
			chapter = scenesOnly;
			tops.push(scenesOnly);
		} else front = { from: 0, to: found.front };
		cuts.forEach((cut: Cut, k) => {
			const range: Scene = { from: cut.at + (cut.drop ? 1 : 0), to: cuts[k + 1]?.at ?? sentinel };
			if (cut.level === 'part') {
				part = { title: cut.title, heading: cut.title, own: has(range) ? range : null, chapters: [] };
				tops.push(part);
				chapter = null;
			} else if (cut.level === 'chapter') {
				chapter = { title: cut.title, heading: cut.title, scenes: [range] };
				(part ? part.chapters : tops).push(chapter);
			} else if (chapter) chapter.scenes.push(range);
		});
	}
	// a chapter is the scenes that have text; one with none is one empty note
	for (const c of [...tops, ...tops.flatMap((t) => ('chapters' in t ? t.chapters : []))]) if ('scenes' in c) { const kept = c.scenes.filter(has); c.scenes = kept.length ? kept : [c.scenes[0]]; }

	// ---- the notes ----
	let numbered = 0;
	const chapterFolders = { any: false };
	const sceneName = (s: Scene, i: number): string => {
		if (o.scenes === 'words') {
			for (let u = s.from; u < s.to; u++) if (units[u].words) { const w = firstWords(text.slice(units[u].start, units[u].end)); if (w) return w; break; }
		}
		return `Scene ${i + 1}`;
	};
	const emitChapter = (c: Chapter, parent: string) => {
		const n = ++numbered, t = titled(parent, c.heading, `Chapter ${n}`, c.scenes.length > 1);
		if (c.scenes.length === 1) {
			const body = piece(c.scenes[0]);
			const path = `${t.path}.md`;
			makeNote(path, t.made, t.differs && c.heading ? `# ${c.heading}\n\n${body}` : body, false, c.heading ?? undefined);
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
		makeNote(folderNote, t.made, '', true, c.heading ?? undefined);
		c.scenes.forEach((s, i) => {
			const path = `${fresh(t.path, sceneName(s, i))}.md`;
			makeNote(path, path.split('/').pop()?.replace(/\.md$/i, '') ?? '', piece(s), false);
			contentsList.push(rel(path));
			order.push(path);
		});
	};

	if (one) {
		const path = `${fresh(root, 'Manuscript')}.md`;
		makeNote(path, 'Manuscript', piece(one), false);
		contentsList.push(rel(path));
		order.push(path);
		warn('', 'No chapters were found. Everything comes in as one note. Split it where you like with Split scene at cursor.');
	} else if (found.signal === 'none') {
		warn('', `No chapters were found. The ${cuts.length + 1} scenes are in one folder, “Chapter 1”, and you can rename or split it.`);
	}

	// front matter: a folder the book's front in, cut at the headings that name front matter
	if (front && front.to > front.from) {
		const marks = [front.from, ...Array.from({ length: front.to - front.from }, (_, i) => front.from + i).filter((i) => i > front.from - 1 && units[i].heading !== null && MATTER.test(nameOf(units[i].text)))];
		const starts = [...new Set(marks)].sort((a, b) => a - b);
		const parts = starts.map((from, i) => ({ from, to: starts[i + 1] ?? front.to })).map((p) => {
			const named = units[p.from].heading !== null && MATTER.test(nameOf(units[p.from].text));
			return { scene: { from: named ? p.from + 1 : p.from, to: p.to }, title: named ? nameOf(units[p.from].text) : 'Title page', heading: named ? units[p.from].text : undefined };
		}).filter((p) => has(p.scene) || p.heading);
		if (parts.length) {
			const dir = `${root}/${FRONT}`;
			folder(dir);
			reserve(dir);
			const folderNote = `${dir}/${FRONT}.md`;
			reserve(folderNote);
			order.push(folderNote);
			contentsList.push(`${FRONT}/`);
			makeNote(folderNote, FRONT, '', true);
			for (const p of parts) {
				const path = `${fresh(dir, p.title)}.md`;
				makeNote(path, path.split('/').pop()?.replace(/\.md$/i, '') ?? p.title, piece(p.scene), false, p.heading);
				contentsList.push(rel(path));
				order.push(path);
			}
		}
	}

	if (scenesOnly) emitChapter(scenesOnly, root);
	else for (const t of tops) {
		if (!('chapters' in t)) { emitChapter(t, root); continue; }
		const n = titled(root, t.heading, 'Part', true);
		folder(n.path);
		const folderNote = `${n.path}/${n.made}.md`;
		reserve(folderNote);
		order.push(folderNote);
		contentsList.push(`${rel(n.path)}/`);
		makeNote(folderNote, n.made, '', true, t.heading);
		if (t.own) {
			const path = `${fresh(n.path, `${n.made} text`)}.md`;
			makeNote(path, path.split('/').pop()?.replace(/\.md$/i, '') ?? '', piece(t.own), false);
			contentsList.push(rel(path));
			order.push(path);
			warn(t.heading, 'It has text of its own, which is the first note in its folder here.', path);
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
