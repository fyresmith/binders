import { display, hexColor } from '../../view/labels';
import { blocksText, countWords, type Picture, type Role, type Structure, type Warning } from '../model';
import { assignRoles, guessStructure, type SourceItem } from '../roles';
import { FORMAT, FULL_SHAPE, ITEM_SECTION_TYPES, KEYWORDS, NEUTRAL_HEX, PALETTE_HEX, PATH_FIELD, floats, scrivDate, uuid, xml } from './parts';
import { rtf, type RtfContext } from './rtf';
import { ROOTS, compileXml, rootId, scrivx, type Doc, type Lists } from './scrivx';
import { STYLES_XML } from './styles-xml';
import { readText, unmarked } from './text';

/* A binder as a Scrivener 3 project: not a book but the binder itself. Its folders and notes in binder order under
   Draft, each note's text as rich text, and what a writer set in Binders carried across (docs/export.md, "The
   Scrivener project", has the table; the import that comes after reads it right to left). Pure: the notes' text and
   everything about them is handed in, and what comes out is the project's files, to be written as a folder. */

/** An earlier text of a note. */
export interface ScrivSnapshot { title: string; when: number; text: string }

/** A note or folder of the binder with what Binders knows about it. A folder's `text` is its folder note's. */
export interface ScrivItem extends SourceItem {
	synopsis?: string;
	label?: string;
	status?: string;
	target?: number;
	tags?: string[];
	/** Its `notes` property: the document's notes in Scrivener. */
	notes?: string;
	/** Its other properties, as text. */
	props?: Record<string, string>;
	created?: number;
	modified?: number;
	snapshots?: ScrivSnapshot[];
	children?: ScrivItem[];
}

export interface ScrivSource {
	/** The project's name: the binder's. */
	name: string;
	/** The binder's folder, as a path in the vault: ids are made from it, and every item's path is said from it. */
	path: string;
	items: ScrivItem[];
	/** The binder note: its own text and card. */
	note?: ScrivItem;
	/** Notes in the binder's folder that are no part of it (a Longform project has them). */
	loose?: ScrivItem[];
	structure?: Structure | null;
	flat?: boolean;
	language?: string;
	/** The labels and statuses in Binders' settings, in their order. */
	labels: readonly { name: string; color: string }[];
	statuses: readonly string[];
}

export interface ScrivOptions {
	/** Notes outside the manuscript, into Research: the binder note's text, what is left out of export at the top of
	    the binder, and the loose notes. Off: the first and last aren't exported, and the second stay where they are. */
	outside: boolean;
	snapshots: boolean;
	/** Binders' version, for the project's `Creator`. */
	version: string;
	when?: Date;
	/** `Files/styles.xml` and `Settings/compile.xml` too (the default), or the bare project. */
	full?: boolean;
	/** A picture a note shows, by the name it uses. */
	picture?(src: string, from: string): { picture: Picture; name: string } | null;
	/** The note a link leads to, as a path in the vault. Without it, a note of the binder is found by its name. */
	link?(to: string, from: string): string | null;
}

/** A row of the preview: the project as Scrivener will list it. */
export interface ScrivRow { title: string; depth: number; kind: 'root' | 'folder' | 'text' | 'image'; status: string; included: boolean; path: string }

export interface ScrivProject {
	/** The `.scrivx`, which is named for the project's folder when it is written (`scrivFiles`). */
	scrivx: string;
	/** Every other file, by its path in the project. */
	files: Map<string, Uint8Array>;
	rows: ScrivRow[];
	documents: number;
	folders: number;
	snapshots: number;
	/** The words of the draft that Scrivener will count: its included documents'. */
	words: number;
	/** What stayed as Markdown or was left out, each with its note. */
	warnings: Warning[];
}

const TYPES: [Role, string, string][] = [['part', 'Part', 'NEW-PAGE-HEADER-WITH-TEXT'], ['chapter', 'Chapter', 'NEW-PAGE-HEADER-WITH-TEXT'], ['scene', 'Scene', 'TEXT-SECTION'], ['front', 'Front matter', 'NEW-PAGE-HEADER-WITH-TEXT'], ['back', 'Back matter', 'NEW-PAGE-HEADER-WITH-TEXT'], ['group', 'Group', 'TEXT-SECTION']];
/** What the structure makes of a folder and of a note, when nothing else is said: the project's two defaults. */
const DEFAULTS: Record<Structure, [Role, Role]> = { chapters: ['chapter', 'scene'], parts: ['part', 'chapter'], 'parts-chapters': ['part', 'scene'], notes: ['group', 'chapter'] };

const enc = new TextEncoder();
const EMPTY_RTF = '{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\n{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}\n\\f0\\fs24 }';

export function writeScriv(src: ScrivSource, o: ScrivOptions): ScrivProject {
	const ns = src.path, when = o.when ?? new Date(), files = new Map<string, Uint8Array>(), warnings: Warning[] = [];
	const put = (path: string, text: string) => { files.set(path, enc.encode(text)); };
	const rel = (it: SourceItem) => (it.path === src.path ? src.name : it.path.slice(src.path.length + 1).replace(/\.md$/i, '') + (it.kind === 'folder' ? '/' : ''));
	const warn = (it: SourceItem, text: string) => { if (!warnings.some((w) => w.path === it.path && w.text === text)) warnings.push({ path: it.path, name: it.name, text }); };

	// ---- what goes where ----
	const top = src.items, outside = o.outside ? top.filter((it) => !it.included) : [];
	const draft = top.filter((it) => !outside.includes(it));
	const noteDoc: ScrivItem | null = o.outside && src.note?.text?.trim() ? { ...src.note, kind: 'note', name: `${src.name} (binder note)`, included: true, children: [] } : null;
	const research: ScrivItem[] = [...(noteDoc ? [noteDoc] : []), ...outside, ...(o.outside ? src.loose ?? [] : [])];

	// ---- every item's id first, so a link can lead to a document further down ----
	const ids = new Map<ScrivItem, string>(), byPath = new Map<string, string>(), byName = new Map<string, string>(), taken = new Set<string>(ROOTS.map(([t]) => rootId(ns, t)));
	const fresh = (key: string): string => { let id = uuid(ns, key); for (let n = 2; taken.has(id); n++) id = uuid(ns, `${key}#${n}`); taken.add(id); return id; };
	const each = (list: readonly ScrivItem[], fn: (it: ScrivItem, depth: number) => void, depth = 0) => { for (const it of list) { fn(it, depth); each(it.children ?? [], fn, depth + 1); } };
	each([...draft, ...research], (it) => {
		const id = fresh(it === noteDoc ? 'binder-note' : `item:${rel(it)}`);
		ids.set(it, id);
		if (it.kind !== 'note') return;
		byPath.set(it.path.toLowerCase(), id);
		if (!byName.has(it.name.toLowerCase())) byName.set(it.name.toLowerCase(), id);
	});
	const linkFrom = (from: string) => (to: string): string | null => {
		const name = to.split('#')[0].trim().replace(/\.md$/i, '');
		if (!name) return null;
		const path = o.link?.(to, from);
		if (path !== undefined) return path ? byPath.get(path.toLowerCase()) ?? null : null;
		return byPath.get(`${src.path}/${name}.md`.toLowerCase()) ?? byName.get((name.split('/').pop() ?? name).toLowerCase()) ?? null;
	};

	// ---- the lists a project keeps: labels, statuses, keywords, fields, section types ----
	const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
	const colorOf = (c: string) => floats(PALETTE_HEX[c.trim().toLowerCase()] ?? hexColor(c) ?? NEUTRAL_HEX);
	const lists: Lists = {
		labels: src.labels.map((l) => ({ name: l.name, color: colorOf(l.color) })), statuses: [...src.statuses], keywords: [],
		fields: [[PATH_FIELD, 'Binders path']], types: TYPES.map(([role, name]) => [uuid(ns, `type:${role}`), name]), folderType: '', textType: '',
	};
	const labelId = (label: string | undefined): number | null => {
		const l = (label ?? '').trim();
		if (!l) return null;
		const i = lists.labels.findIndex((x) => same(x.name, l));
		// (a label of its own color, or one that names none: it is a label of the project all the same)
		return i >= 0 ? i : lists.labels.push({ name: hexColor(l) ?? display(l), color: colorOf(l) }) - 1;
	};
	const listed = (list: string[], v: string | undefined): number | null => {
		const s = (v ?? '').trim();
		if (!s) return null;
		const i = list.findIndex((x) => same(x, s));
		return i >= 0 ? i : list.push(s) - 1;
	};
	const fieldId = (key: string): string => {
		const had = lists.fields.find(([, title]) => title === key);
		if (had) return had[0];
		const base = key.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'field';
		let id = base === PATH_FIELD ? `${base}2` : base;
		for (let n = 2; lists.fields.some(([f]) => f === id); n++) id = `${base}${n}`;
		lists.fields.push([id, key]);
		return id;
	};
	const structure = src.structure ?? (src.flat ? 'notes' : guessStructure(draft));
	const roles = new Map<SourceItem, Role>(assignRoles(draft, structure).placed.map((p) => [p.item, p.role]));
	const typeId = (role: Role) => uuid(ns, `type:${role}`);
	lists.folderType = typeId(DEFAULTS[structure][0]);
	lists.textType = typeId(DEFAULTS[structure][1]);

	// ---- the documents ----
	const pictures = new Map<string, { picture: Picture; name: string }>(), rows: ScrivRow[] = [];
	let words = 0, chars = 0, documents = 0, folders = 0, snapshots = 0;
	const toRtf = (it: ScrivItem, text: string, count: boolean): string | null => {
		const parsed = readText(text), link = linkFrom(it.path);
		for (const w of parsed.warnings) warn(it, w);
		const ctx: RtfContext = {
			notes: parsed.notes, link,
			picture: (name) => { const p = o.picture?.(name, it.path) ?? null; if (p && p.picture.type !== 'gif') pictures.set(p.name, p); return p?.picture ?? null; },
			kept: (what) => warn(it, `${what} stays as it is typed.`),
		};
		if (count) { const said = unmarked(blocksText(parsed.blocks)); words += countWords(said); chars += said.length; }
		return rtf(parsed.blocks, ctx);
	};
	/** `above`: nothing above it is left out (a folder left out leaves out what is in it). */
	const doc = (it: ScrivItem, depth: number, inDraft: boolean, above: boolean): Doc => {
		const id = ids.get(it) ?? fresh(`item:${rel(it)}`), dir = `Files/Data/${id}/`, included = it.included && above;
		const body = (it.text ?? '').trim() ? toRtf(it, it.text ?? '', inDraft && included) : null;
		if (body) put(`${dir}content.rtf`, body);
		// (plain UTF-8, no line break at its end, as Scrivener writes it)
		if (it.synopsis?.trim()) put(`${dir}synopsis.txt`, it.synopsis.trim());
		const notes = it.notes?.trim() ? toRtf(it, it.notes, false) : null;
		if (notes) put(`${dir}notes.rtf`, notes);
		if (o.snapshots && it.snapshots?.length) {
			const sdir = `Snapshots/${id}.snapshots/`, used = new Set<string>(), index: string[] = [];
			for (const s of [...it.snapshots].sort((a, b) => a.when - b.when)) {
				// (a snapshot's file is named for its moment: two in the same second are a second apart)
				let at = new Date(s.when), stamp = scrivDate(at);
				while (used.has(stamp)) { at = new Date(at.getTime() + 1000); stamp = scrivDate(at); }
				used.add(stamp);
				index.push('    <Snapshot>', `        <Title>${xml(s.title || 'Untitled Snapshot')}</Title>`, `        <Date>${stamp}</Date>`, '    </Snapshot>');
				put(`${sdir}${stamp.replace(/ ([+-]\d{4})$/, '$1').replace(/[ :]/g, '-')}.rtf`, toRtf(it, s.text, false) ?? EMPTY_RTF);
				snapshots++;
			}
			put(`${sdir}index.xml`, ['<?xml version="1.0" encoding="UTF-8"?>', '<Snapshots Version="1.0">', ...index, '</Snapshots>', ''].join('\n'));
		}
		const role = inDraft ? roles.get(it) : undefined, wanted = role && role !== 'out' ? typeId(role) : null;
		const fields: [string, string][] = [[PATH_FIELD, rel(it)]];
		for (const [k, v] of Object.entries(it.props ?? {})) if (v.trim()) fields.push([fieldId(k), v.trim()]);
		if (it.kind === 'folder') folders++; else documents++;
		rows.push({ title: it.name, depth: depth + 1, kind: it.kind === 'folder' ? 'folder' : 'text', status: (it.status ?? '').trim(), included, path: it === noteDoc ? src.note?.path ?? it.path : it.path });
		const created = new Date(it.created ?? it.modified ?? when.getTime()), modified = new Date(it.modified ?? it.created ?? when.getTime());
		return {
			id, type: it.kind === 'folder' ? 'Folder' : 'Text', title: it.name, created, modified, included,
			label: labelId(it.label), status: listed(lists.statuses, it.status),
			section: ITEM_SECTION_TYPES && wanted && wanted !== (it.kind === 'folder' ? lists.folderType : lists.textType) ? wanted : null,
			target: it.target && it.target > 0 ? Math.round(it.target) : 0, fields,
			keywords: KEYWORDS ? [...new Set((it.tags ?? []).map((t) => listed(lists.keywords, t.replace(/^#/, ''))).filter((k): k is number => k != null))] : [],
			children: (it.children ?? []).map((c) => doc(c, depth + 1, inDraft, included)),
		};
	};
	rows.push({ title: 'Draft', depth: 0, kind: 'root', status: '', included: true, path: '' });
	const draftDocs = draft.map((it) => doc(it, 0, true, true));
	rows.push({ title: 'Research', depth: 0, kind: 'root', status: '', included: true, path: '' });
	const researchDocs = research.map((it) => doc(it, 0, false, true));
	// a picture set in the text is also a file in Research, as Scrivener keeps one that was brought in
	for (const [name, p] of pictures) {
		const id = fresh(`file:${name}`), extension = p.picture.type === 'png' ? 'png' : 'jpg', title = (name.split('/').pop() ?? name).replace(/\.[^.]+$/, '');
		files.set(`Files/Data/${id}/content.${extension}`, p.picture.data);
		researchDocs.push({ id, type: 'Image', title, created: when, modified: when, included: true, label: null, status: null, section: null, target: 0, fields: [], keywords: [], extension, children: [] });
		rows.push({ title, depth: 1, kind: 'image', status: '', included: true, path: '' });
	}
	rows.push({ title: 'Trash', depth: 0, kind: 'root', status: '', included: true, path: '' });

	put('Files/version.txt', FORMAT);
	if (o.full ?? FULL_SHAPE) {
		put('Files/styles.xml', STYLES_XML);
		put('Settings/compile.xml', compileXml(src.name, src.language || 'en', TYPES.map(([role, , layout]) => [typeId(role), layout])));
	}
	const target = src.note?.target && src.note.target > 0 ? Math.round(src.note.target) : 0;
	return { scrivx: scrivx({ ns, version: o.version, when, draft: draftDocs, research: researchDocs, lists, target, words, chars }), files, rows, documents, folders, snapshots, words, warnings };
}

/** The project's files as they are written into a folder named `<name>.scriv`: the `.scrivx` is named like it. */
export function scrivFiles(p: ScrivProject, name: string): Map<string, Uint8Array> {
	return new Map<string, Uint8Array>([[`${name}.scrivx`, enc.encode(p.scrivx)], ...p.files]);
}
