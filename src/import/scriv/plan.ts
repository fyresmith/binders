import type { BindersSettings } from '../../settings-data';
import { SNAPSHOTS, SNAPSHOT_EXT, snapshotFile, snapshotName } from '../../snapshot-text';
import { PALETTE_HEX, PATH_FIELD, snapshotRtf } from '../../export/scriv/parts';
import { MAX_BYTES, MAX_FILES, TOO_BIG, utf8 } from '../source';
import { escapeMarkdown, readRtf } from './rtf';
import { children, readXml, value, type Element } from './xml';
import type { ReadItem, ReadProject } from './project';

/* A Scrivener project as the binder it will be: every file import would write, with its bytes, before anything is
   written. Pure, so what it does with a project is unit-tested (tests/import-scrivener.test.ts), and the dialog shows
   exactly what will be made. Nothing here reads the vault or the disk: the project is in hand (source.ts), and
   vault.ts writes the plan.

   What becomes what:
     - the Draft folder is the binder, and its documents the binder's notes and folders, in Scrivener's order (the
       binder note's `contents`). A document's synopsis, notes, label, status, target, keywords and custom fields are
       the note's properties; "Include in compile" off is `export: false`.
     - a folder (or a document with documents under it) that has text of its own gets that text as its first note,
       "<its name> text": in Scrivener it is part of the manuscript, and a folder note's text here is not.
     - Research and whatever else is outside the Draft go in a "Research" folder that no export takes. Trash is left.
     - a document's snapshots are that note's snapshots, in the binder's "Snapshots" folder.
     - every original file is kept as it is under "Research/Originals", by its note's path: what rich text has that
       Markdown doesn't is still there, and so is a file that couldn't be read at all. */

const enc = new TextEncoder();
const RESEARCH = 'Research', ORIGINALS = 'Originals', ATTACHMENTS = 'Attachments';
/** Property names import may not hand to a custom field: they are Binders' own, or Obsidian's. */
const OWN = ['binder', 'contents', 'export', 'export-as', 'snapshot-of', 'taken', 'tags'];

/** A row of what will be made, in the binder's order: a note, or a folder (whose `path` is its folder note's). */
export interface PlannedNote {
	path: string; title: string; body: string; folder: boolean; depth: number;
	/** Left out of an export: research, or a document with "Include in compile" off. */
	out: boolean;
	status: string;
}
/** Something the writer should know about one item, as the dialog lists it: the note it is about (its path in the
    plan, "" when it is about no note), its title, and what is said. */
export interface Said { path: string; name: string; text: string }
export interface ImportPlan {
	name: string;
	/** Every file to make, by its path in the vault. The binder note is among them, and is written last. */
	files: Map<string, Uint8Array>;
	/** Every folder to make, a folder before what is in it. */
	folders: string[];
	notes: PlannedNote[];
	/** What is said, as lines for the binder note ("Arrival: ..."), and by item for the dialog. */
	warnings: string[];
	said: Said[];
	/** Labels and statuses the project has and the vault's settings don't. */
	labels: { name: string; color: string }[];
	statuses: string[];
	sceneCount: number; snapshotCount: number; trashCount: number;
}
export interface PlanOptions { name: string; parent: string; research: boolean; snapshots: boolean; settings: BindersSettings }

/** A title as a file's name on any system: no character a path or a link reads, no dot or space at either end, not
    one of the names Windows keeps for itself, a hundred characters at most. Never empty. */
export function safeName(name: string): string {
	const cleaned = [...name.normalize('NFC')].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('').replace(/[*"\\/<>:|?#[\]^]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
	const safe = [...cleaned].slice(0, 100).join('').replace(/[. ]+$/, '') || 'Untitled';
	return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safe) ? `Original ${safe}` : safe;
}

/** Two names that are one file on a disk that doesn't tell upper case from lower, or one way of writing "é" from another. */
const key = (s: string) => s.normalize('NFC').toLowerCase();

/** Is this a place import may write: the binder's folder, or under it by steps that are each a name a vault on any
    system holds (not empty, not led by a dot, not ended by a dot or a space, no backslash)? Every path is made from
    names passed through `safeName`, so this is never false; it is asked all the same before a path is planned and
    again before it is written, because a path that climbed out would be a note written over someone's writing. */
export function inBinder(root: string, path: string): boolean {
	if (path === root) return true;
	return path.startsWith(root + '/') && path.slice(root.length + 1).split('/').every((step) => step !== '' && !/^\.|[. ]$|\\/.test(step));
}

/** A note as Obsidian would write it: a name as it is where YAML takes it so, a list as lines, and no block of
    properties at all for a note that has none. A value is written quoted, as JSON, which YAML reads as it is. */
function note(props: Record<string, unknown>, body: string): string {
	const name = (k: string) => (/^[A-Za-z][\w-]*$/.test(k) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(k) ? k : JSON.stringify(k));
	const lines = Object.entries(props).map(([k, v]) => `${name(k)}:${Array.isArray(v) ? (v.length ? v.map((x) => `\n  - ${JSON.stringify(x)}`).join('') : ' []') : ` ${JSON.stringify(v)}`}`);
	return lines.length ? `---\n${lines.join('\n')}\n---\n${body}` : body;
}

/** Whether a rich text file has any text, kept by the file's own bytes: a project is planned again each time a
    choice changes, and this is asked of every document each time. One that can't be read has text: its note says
    so, and links to the original. */
const WRITTEN = new WeakMap<Uint8Array, boolean>();
function written(bytes: Uint8Array | undefined): boolean {
	if (!bytes) return false;
	let has = WRITTEN.get(bytes);
	if (has === undefined) {
		try { has = !!readRtf(bytes, { picture: () => 'picture' }).markdown.trim(); } catch { has = true; }
		WRITTEN.set(bytes, has);
	}
	return has;
}

/** A link to a file of the plan, by its whole path so it can't be taken for another of the same name. A path a
    wikilink can't hold (`#`, `|`, `^`, a bracket) is a Markdown link instead. */
function link(path: string, label: string, image = false): string {
	if (/[#[\]|^]/.test(path)) return `${image ? '!' : ''}[${escapeMarkdown(label)}](${path.split('/').map(encodeURIComponent).join('/').replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))})`;
	return `${image ? '!' : ''}[[${image ? path : `${path.replace(/\.md$/i, '')}|${label.replace(/[|\]\r\n]/g, ' ')}`}]]`;
}

export function planImport(project: ReadProject, o: PlanOptions): ImportPlan {
	const s = o.settings, mine = [s.synopsisProp, s.notesProp, s.labelProp, s.statusProp, s.targetProp];
	if (new Set(mine.map(key)).size !== mine.length || mine.some((p) => OWN.includes(key(p)))) throw new Error('Two of the property names in Binders’ settings are the same, or one is a name Binders keeps for itself. Give each its own name, then import.');
	const { source } = project, name = safeName(o.name), root = o.parent ? `${o.parent}/${name}` : name;
	const research = `${root}/${RESEARCH}`, researchNote = `${research}/${RESEARCH}.md`, binderNote = `${root}/${name}.md`;
	// What is kept beside the notes goes with the research, which no export takes: at the top of the binder a folder
	// of pictures or of original files would be a chapter of the manuscript.
	const originals = `${research}/${ORIGINALS}`, attachments = `${research}/${ATTACHMENTS}`;
	const plan: ImportPlan = { name, files: new Map(), folders: [], notes: [], warnings: [], said: [], labels: [], statuses: [], sceneCount: 0, snapshotCount: 0, trashCount: 0 };
	const rel = (path: string) => path.slice(root.length + 1).replace(/\.md$/i, '');

	// ---- what is said ----

	/** Where each document's text goes, by its id: what a link to it points at, and where what is said of it leads. */
	const paths = new Map<string, string>();
	const lines = new Set<string>(), about: { it: ReadItem | null; name: string; text: string }[] = [];
	const warn = (it: ReadItem | string, text: string) => {
		const title = typeof it === 'string' ? it : it.title, line = `${title}: ${text}`;
		if (lines.has(line)) return;
		lines.add(line);
		about.push({ it: typeof it === 'string' ? null : it, name: title, text });
	};

	// ---- the project's files ----

	const sourcePaths = new Map([...source.files.keys()].map((p) => [key(p), p])), consumed = new Set<string>();
	/** A document's own files, by its id: what is in "Files/Data/<id>/" and in "Snapshots/<id>.snapshots/". */
	const owned = new Map<string, { path: string; inner: string; snapshot: boolean }[]>();
	for (const path of source.files.keys()) {
		const m = /^(?:files\/data\/([^/]+)\/|snapshots\/([^/]+)\.snapshots\/)(.+)$/i.exec(path);
		if (!m) continue;
		const id = (m[1] ?? m[2]).toUpperCase(), list = owned.get(id) ?? [];
		list.push({ path, inner: m[3], snapshot: !m[1] });
		owned.set(id, list);
	}
	const dataPath = (it: ReadItem, file: string) => `Files/Data/${it.id}/${file}`;
	const has = (path: string) => sourcePaths.has(key(path));
	/** A file of the project, which is then accounted for: what is never asked for is kept as an original at the end. */
	const get = (path: string): Uint8Array | undefined => {
		const actual = sourcePaths.get(key(path));
		if (!actual) return undefined;
		consumed.add(actual);
		return source.files.get(actual);
	};
	const hasSnapshots = (it: ReadItem) => o.snapshots && has(`Snapshots/${it.id}.snapshots/index.xml`);
	const hasText = (it: ReadItem) => written(source.files.get(sourcePaths.get(key(dataPath(it, 'content.rtf'))) ?? '')) || hasSnapshots(it);

	// ---- the files to make ----

	const unsafe = () => new Error('A name in the project can’t be made into a file’s name. Nothing was imported.');
	const folders = new Set<string>();
	const folder = (path: string) => { if (!inBinder(root, path)) throw unsafe(); folders.add(path); };
	let outputBytes = 0;
	const put = (path: string, text: string | Uint8Array) => {
		if (!inBinder(root, path)) throw unsafe();
		if (plan.files.has(path)) throw new Error('Two imported files have the same path.');
		const data = typeof text === 'string' ? enc.encode(text) : text;
		outputBytes += data.length;
		if (outputBytes > MAX_BYTES || plan.files.size >= MAX_FILES) throw new Error(TOO_BIG);
		plan.files.set(path, data);
	};

	// ---- names ----

	/** The names taken in each folder, as a disk that can't tell cases apart sees them. A note's and a folder's are
	    one name: "Arrival.md" beside a folder "Arrival" would make the note that folder's own. */
	const used = new Set<string>();
	const reserve = (path: string) => used.add(key(path.replace(/\.md$/i, '')));
	const fresh = (parent: string, title: string): string => {
		// (a title that ends in ".md" would be a note called "x.md.md": the ending goes, and what is left is cleaned
		// again, since "a..md" leaves "a.", a name Windows won't keep)
		let stem = safeName(title);
		while (/\.md$/i.test(stem)) stem = safeName(stem.slice(0, -3));
		let n = stem;
		for (let i = 2; used.has(key(`${parent}/${n}`)); i++) n = `${stem} ${i}`;
		reserve(`${parent}/${n}`);
		// (a note's name is its file's: said, since the title the writer gave it is not quite the one it has here)
		if (stem !== title) warn(title, 'Its title has characters a file’s name can’t have, so it is named without them.');
		else if (n !== title) warn(title, 'Another item beside it has the same name, so a number is added to this one’s.');
		return `${parent}/${n}`;
	};
	folder(root);
	for (const taken of [`${root}/${name}`, `${root}/${SNAPSHOTS}`, research, `${research}/${RESEARCH}`, originals, attachments]) reserve(taken);

	// ---- the binder's items, and where each goes ----

	const count = (it: ReadItem): number => 1 + it.children.reduce((sum, c) => sum + count(c), 0);
	const draft = project.roots.find((i) => i.type === 'DraftFolder'), outside = project.roots.filter((i) => i.type !== 'DraftFolder' && i.type !== 'TrashFolder');
	for (const it of project.roots.filter((i) => i.type === 'TrashFolder')) plan.trashCount += it.children.reduce((sum, c) => sum + count(c), 0);
	/** The text a folder has of its own, as a document to put first in it: the same document, as text, with no items. */
	const synthetic = new Set<ReadItem>();
	const ownText = (it: ReadItem): ReadItem[] => {
		if (!hasText(it)) return [];
		const text: ReadItem = { ...it, type: 'Text', title: `${it.title} text`, children: [] };
		synthetic.add(text);
		return [text];
	};
	const draftItems = [...ownText(draft), ...draft.children];
	const researchItems = o.research ? outside.flatMap((it) => (it.type === 'ResearchFolder' ? [...ownText(it), ...it.children] : [it])) : [];
	const researchRoot = o.research ? outside.find((it) => it.type === 'ResearchFolder') : undefined;
	paths.set(draft.id, binderNote);
	if (researchRoot) paths.set(researchRoot.id, researchNote);

	/** Where an item goes: a folder (`path`) or a note (`path`, ending ".md"), and the note its own text is in. */
	const allocated = new Map<ReadItem, { path: string; text: string | null; group: boolean }>(), order: string[] = [];
	const allocate = (list: ReadItem[], parent: string) => {
		for (const it of list) {
			const path = fresh(parent, it.title), group = it.children.length > 0 || it.type.endsWith('Folder'), folderNote = `${path}/${path.split('/').pop()}.md`;
			if (group) { folder(path); reserve(folderNote); order.push(folderNote); }
			const own = group && hasText(it);
			const text = !group ? `${path}.md` : own ? `${fresh(path, `${safeName(it.title)} text`)}.md` : null;
			if (text) order.push(text);
			allocated.set(it, { path: group ? path : `${path}.md`, text, group });
			paths.set(it.id, text ?? folderNote);
			if (own) warn(it, 'It has text of its own, which is the first note in its folder here.');
			allocate(it.children, path);
		}
	};
	allocate(draftItems, root);
	if (o.research && outside.length) { folder(research); order.push(researchNote); allocate(researchItems, research); }

	// ---- labels and statuses ----

	// (a label in one of Obsidian's named colors is that color's shade in a project, as export writes it: a binder
	// that went out to Scrivener comes back to the labels it had, not to a second set beside them)
	const shade = (c: string) => key(PALETTE_HEX[c.trim().toLowerCase()] ?? c);
	const labelNames = new Map<string, string>(), takenLabels = [...s.labels];
	for (const [id, l] of project.labels) {
		const same = takenLabels.find((v) => key(v.name) === key(l.name) && shade(v.color) === shade(l.color));
		let title = same?.name ?? l.name;
		if (!same) {
			// (a label of this name in another color is the vault's: the project's comes in beside it, under its own name)
			if (takenLabels.some((v) => key(v.name) === key(title))) title = `${l.name} (${name})`;
			const base = title;
			for (let i = 2; takenLabels.some((v) => key(v.name) === key(title)); i++) title = `${base} ${i}`;
			const added = { name: title, color: l.color || '#808080' };
			plan.labels.push(added);
			takenLabels.push(added);
			if (title !== l.name) warn(l.name, `This vault has a label of that name in another color, so the project’s is “${title}” here.`);
		}
		labelNames.set(id, title);
	}
	plan.statuses = [...new Set(project.statuses.values())].filter((v) => !s.statuses.includes(v));

	// ---- originals, and text ----

	const preserved = new Set<string>(), preservedDirs = new Map<string, string>();
	/** A file of the project kept as it is, under its note's own path in the binder, so the original of
	    "Part one/Arrival" is found by its name. `filename` may have folders of its own. Returns where it is kept. */
	const keepOriginal = (it: ReadItem, filename: string, bytes: Uint8Array): string => {
		const to = paths.get(it.id);
		folder(research);
		folder(originals);
		let dir = originals;
		for (const step of (to ? rel(to) : it.id).split('/')) { dir += '/' + step; folder(dir); }
		const parts = filename.split('/');
		let sourceDir = it.id;
		for (const part of parts.slice(0, -1)) {
			sourceDir += '/' + part;
			let next = preservedDirs.get(sourceDir);
			if (!next) {
				const stem = `${dir}/${safeName(part)}`;
				next = stem;
				for (let n = 2; preserved.has(key(next)); n++) next = `${stem} ${n}`;
				preserved.add(key(next));
				preservedDirs.set(sourceDir, next);
			}
			dir = next;
			folder(dir);
		}
		const safe = safeName(parts[parts.length - 1]), dot = safe.lastIndexOf('.'), stem = dot > 0 ? safe.slice(0, dot) : safe, ext = dot > 0 ? safe.slice(dot) : '';
		let path = `${dir}/${safe}`;
		for (let i = 2; preserved.has(key(path)); i++) path = `${dir}/${stem} ${i}${ext}`;
		preserved.add(key(path));
		put(path, bytes);
		return path;
	};

	let pictureNo = 0;
	/** A rich text file as Markdown. One that can't be read (damaged, cut short, not rich text at all) costs that one
	    text, not the project: its bytes are kept as they are, the note links to them, and it is said by name.
	    `what`: what the file is, as it is said ("Its text"). */
	const convert = (it: ReadItem, filename: string, bytes: Uint8Array, what: string): string => {
		const kept = keepOriginal(it, filename, bytes), pictures: [string, Uint8Array][] = [];
		try {
			const result = readRtf(bytes, {
				link: (id, label) => { const to = paths.get(id.toUpperCase()); return to ? link(to, label) : null; },
				picture: (data, ext) => { const path = `${attachments}/Picture ${pictureNo + pictures.length + 1}.${ext}`; pictures.push([path, data]); return link(path, '', true); },
			});
			// (a picture is kept once its text is known to be read: one from a text given up on would be linked from nowhere)
			if (pictures.length) { folder(research); folder(attachments); }
			for (const [path, data] of pictures) put(path, data);
			pictureNo += pictures.length;
			for (const w of result.warnings) warn(it, w);
			return result.markdown;
		} catch (e) {
			warn(it, `${what} could not be read: ${e instanceof Error ? e.message : String(e)}. The original file is kept, and linked from the note.`);
			return `${link(kept, filename)}\n`;
		}
	};

	// ---- properties ----

	const props = (it: ReadItem, inResearch: boolean): Record<string, unknown> => {
		const result = Object.create(null) as Record<string, unknown>;
		const synopsis = get(dataPath(it, 'synopsis.txt')), notes = get(dataPath(it, 'notes.rtf'));
		if (synopsis) {
			// (a synopsis that isn't the plain text it should be is read as far as it can be, and said: it is a few
			// lines on a card, and not worth a project)
			try { result[s.synopsisProp] = utf8(synopsis); } catch { result[s.synopsisProp] = new TextDecoder().decode(synopsis); warn(it, 'Its synopsis has characters that can’t be read, shown as “\ufffd”.'); }
		}
		if (notes) result[s.notesProp] = convert(it, 'notes.rtf', notes, 'Its notes').trimEnd();
		if (labelNames.has(it.label)) result[s.labelProp] = labelNames.get(it.label);
		if (project.statuses.has(it.status)) result[s.statusProp] = project.statuses.get(it.status);
		if (it.target > 0) {
			if (it.targetType === 'Words') result[s.targetProp] = it.target;
			else { result['scrivener-target'] = `${it.target} ${it.targetType}`; warn(it, 'Its target is counted in characters. It is kept as a property, and not as the note’s target in words.'); }
		}
		if (inResearch || !it.included) result.export = false;
		if (it.section) result['scrivener-section'] = project.sections.get(it.section) ?? it.section;
		if (it.keywords.length) {
			// a keyword as a tag: what a tag can't hold goes, and one that is then nothing, or only a number, isn't one
			const tags = it.keywords.map((k) => k.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_/-]/gu, '')).filter((k) => k && !/^\d+$/.test(k));
			if (tags.length) result.tags = tags;
			if (it.keywords.some((k, i) => tags[i] !== k)) { result['scrivener-keywords'] = it.keywords; warn(it, 'Its keywords are tags here. A tag can’t hold every character, so they are also kept as they were written.'); }
		}
		// (by any case: Obsidian reads "Tags" as it reads "tags")
		const reserved = new Set([...OWN, ...Object.keys(result), ...mine].map(key));
		for (const [field, text] of it.fields) {
			// (the path Binders' own export of a project wrote there, for itself: not the writer's)
			if (field === PATH_FIELD) continue;
			let k = field || 'Scrivener field';
			if (reserved.has(key(k))) k = `Scrivener ${k}`;
			const base = k;
			for (let n = 2; reserved.has(key(k)); n++) k = `${base} ${n}`;
			reserved.add(key(k));
			result[k] = text;
			if (k !== field) warn(it, `Its “${field}” is a property called “${k}” here.`);
		}
		return result;
	};

	// ---- the notes ----

	const makeNote = (path: string, title: string, properties: Record<string, unknown>, body: string, isFolder: boolean) => {
		put(path, note(properties, body));
		const status = properties[s.statusProp];
		plan.notes.push({ path, title, body, folder: isFolder, depth: path.slice(root.length + 1).split('/').length - (isFolder ? 1 : 0), out: properties.export === false, status: typeof status === 'string' ? status : '' });
		if (!isFolder) plan.sceneCount++;
	};

	/** A document's snapshots, as its note's. What can't be brought in is said and left: its files are kept with the
	    originals, below. */
	const snapshots = (it: ReadItem, text: string | null) => {
		const dir = `Snapshots/${it.id}.snapshots`, index = get(`${dir}/index.xml`);
		let list: Element[] = [];
		try {
			const x = index ? readXml(utf8(index)) : null;
			if (x && x.name !== 'Snapshots') throw new Error('not a list of snapshots');
			list = x ? children(x, 'Snapshot') : [];
		} catch { warn(it, 'The list of its snapshots can’t be read, so they weren’t brought in. Their files are kept.'); }
		if (list.length && !text) warn(it, 'Its snapshots have no note to belong to. Their files are kept.');
		if (!text) return;
		for (const snap of list) {
			const date = value(snap, 'Date'), title = value(snap, 'Title'), when = new Date(date.replace(' ', 'T').replace(/ ([-+]\d\d)(\d\d)$/, '$1:$2')), called = title ? `The snapshot “${title}”` : 'A snapshot';
			if (!Number.isFinite(when.getTime())) { warn(it, `${called} has a date that can’t be read, and wasn’t brought in.`); continue; }
			const content = get(`${dir}/${snapshotRtf(date)}`);
			if (!content) { warn(it, `${called} is missing its text, and wasn’t brought in.`); continue; }
			const of = rel(text), at = `${root}/${SNAPSHOTS}/${of}`;
			for (let p = at; p !== root; p = p.slice(0, p.lastIndexOf('/'))) folder(p);
			const file = snapshotName(when, title ? safeName(title) : '', (n) => plan.files.has(`${at}/${n}.${SNAPSHOT_EXT}`));
			put(`${at}/${file}.${SNAPSHOT_EXT}`, snapshotFile(of, when, convert(it, `Snapshot ${plan.snapshotCount + 1}.rtf`, content, called)));
			plan.snapshotCount++;
		}
	};

	// The binder's order: every item by its path from the binder, a folder ("Part one/") before what it holds. It is
	// the binder note's alone: a list in a folder note is never read, and that folder's notes fall into alphabetical order.
	const contents: string[] = [];
	const visit = (list: ReadItem[], inResearch: boolean): void => {
		for (const it of list) {
			const a = allocated.get(it), left = inResearch || !it.included;
			const properties = synthetic.has(it) ? (left ? { export: false } : {}) : props(it, inResearch), bytes = get(dataPath(it, 'content.rtf'));
			let body = bytes ? convert(it, 'content.rtf', bytes, 'Its text') : '';
			// (a document nothing was typed in has no file of text in the project: nothing is missing, and nothing is said)
			if (!a.group && it.type !== 'Text') {
				// a PDF, a picture, a web page: its files are kept as they are, and its note links to them
				if (it.extension && !has(dataPath(it, `content.${it.extension}`))) warn(it, 'Its file is missing from the project.');
				for (const file of owned.get(it.id) ?? []) {
					if (file.snapshot || consumed.has(file.path)) continue;
					consumed.add(file.path);
					body += `\n${link(keepOriginal(it, file.inner, source.files.get(file.path)), file.path.split('/').pop())}\n`;
				}
				warn(it, 'It isn’t text. Its file is kept as it is, and linked from the note.');
				properties.export = false;
			}
			if (a.group) contents.push(`${rel(a.path)}/`);
			// (a folder's own text is a note in it: the folder's card data stays the folder's)
			if (a.text) { contents.push(rel(a.text)); makeNote(a.text, a.group ? `${it.title} text` : it.title, a.group ? (left ? { export: false } : {}) : properties, body, false); }
			if (a.group) {
				visit(it.children, inResearch);
				// ("Include in compile" off on a folder leaves out its own text, not what is in it)
				delete properties.export;
				if (inResearch) properties.export = false;
				makeNote(`${a.path}/${a.path.split('/').pop()}.md`, it.title, properties, '', true);
			}
			if (o.snapshots) snapshots(it, a.text);
		}
	};
	const rootProperties = props(draft, false);
	delete rootProperties.export;
	visit(draftItems, false);
	if (o.research && outside.length) {
		contents.push(`${RESEARCH}/`);
		visit(researchItems, true);
		makeNote(researchNote, RESEARCH, { ...(researchRoot ? props(researchRoot, true) : {}), export: false }, '', true);
	}

	// What nothing above asked for (comments, a document's other files, a snapshot left out) is not dropped: it is
	// kept as it is, and said. Whether research is brought in doesn't change that for the documents that are.
	for (const it of [draft, ...(o.research ? outside : []), ...allocated.keys()]) {
		for (const file of owned.get(it.id) ?? []) {
			if (consumed.has(file.path) || (!o.snapshots && (file.snapshot || /^snapshots\//i.test(file.inner)))) continue;
			consumed.add(file.path);
			keepOriginal(it, file.inner, source.files.get(file.path));
			warn(it, /\.comments$/i.test(file.path) ? 'Its comments in the margin aren’t brought in. Their file is kept with the originals.' : `“${file.path.split('/').pop()}” isn’t brought in. The file is kept with the originals.`);
		}
	}
	// (originals alone make the folder too: it is the binder's then, and out of every export)
	if (folders.has(research) && !plan.files.has(researchNote)) makeNote(researchNote, RESEARCH, { export: false }, '', true);
	if (folders.has(research) && !contents.includes(`${RESEARCH}/`)) contents.push(`${RESEARCH}/`);

	plan.warnings = [...lines];
	plan.said = about.map((a) => ({ path: (a.it && paths.get(a.it.id)) ?? '', name: a.name, text: a.text }));
	const trash = plan.trashCount ? `${plan.trashCount === 1 ? 'One document' : `${plan.trashCount} documents`} in Scrivener’s Trash ${plan.trashCount === 1 ? 'was' : 'were'} left out.\n\n` : '';
	const report = `Imported from the Scrivener project “${escapeMarkdown(source.name)}”. Every original file is kept in ${RESEARCH}/${ORIGINALS}.\n\n${trash}${plan.warnings.length ? `## Import notes\n\n${plan.warnings.map((w) => `- ${escapeMarkdown(w)}`).join('\n')}\n` : ''}`;
	makeNote(binderNote, name, { ...rootProperties, binder: 1, contents, ...(project.target > 0 ? { [s.targetProp]: project.target } : {}) }, report, true);

	// the rows as the binder will list them, and the folders outermost first, as they have to be made
	const sequence = new Map([...new Set([binderNote, ...order, researchNote])].map((p, i) => [p, i]));
	plan.notes.sort((a, b) => (sequence.get(a.path) ?? Infinity) - (sequence.get(b.path) ?? Infinity));
	plan.folders = [...folders].sort((a, b) => a.split('/').length - b.split('/').length);
	return plan;
}
