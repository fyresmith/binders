import { strFromU8 } from 'fflate';
import { pictureOf } from '../src/export/picture';
import type { ScrivItem, ScrivOptions, ScrivSnapshot, ScrivSource } from '../src/export/scriv/project';
import type { SourceItem } from '../src/export/roles';
import { parts } from '../src/scene-text';
import { readSnapshot, readSnapshotName } from '../src/snapshot-text';
import { DEFAULT_LABELS, DEFAULT_STATUSES } from '../src/view/labels';
import type { Files, TestBinder } from './export-vault';

/* For the unit tests of the Scrivener project: a binder of a vault held in memory as the writer is handed one (what
   src/export/scriv/vault.ts does with Obsidian, done here from the files), and what can be checked of a project
   without Scrivener: the structural checks of the format spike's `check-scriv.mjs`. */

/** A note's properties, read by a few patterns: `key: value` and lists of text, which is all a binder's notes have. */
export function props(yaml: string): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {}, un = (v: string) => { const t = v.trim(); try { return /^".*"$/.test(t) ? JSON.parse(t) as string : t.replace(/^'(.*)'$/, '$1'); } catch { return t; } };
	let key = '';
	for (const line of yaml.split('\n')) {
		const item = /^\s+-\s+(.*)$/.exec(line), kv = /^([^\s:#][^:]*):[ \t]*(.*)$/.exec(line);
		if (item && key) { const had = out[key]; out[key] = [...(Array.isArray(had) ? had : []), un(item[1])]; }
		else if (kv) { key = kv[1].trim(); out[key] = /^\[.*\]$/.test(kv[2].trim()) ? kv[2].trim().slice(1, -1).split(',').map(un).filter((x) => x) : un(kv[2]); }
	}
	return out;
}
const OWN = new Set(['synopsis', 'status', 'label', 'target', 'tags', 'notes', 'export', 'compile', 'export-as', 'binder', 'contents', 'longform']);
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

/** A binder as the Scrivener writer is handed it. */
export function sourceOf(files: Files, b: TestBinder): ScrivSource {
	const text = (path: string): string => { const d = files.get(path); return typeof d === 'string' ? d : ''; };
	const card = (path: string): Partial<ScrivItem> => {
		const p = props(parts(text(path)).yaml), more: Record<string, string> = {};
		for (const [k, v] of Object.entries(p)) if (!OWN.has(k)) more[k] = Array.isArray(v) ? v.join(', ') : v;
		const target = Number(one(p.target).replace(/[ ,.]/g, ''));
		return { synopsis: one(p.synopsis), status: one(p.status), label: one(p.label), target: Number.isInteger(target) && target > 0 ? target : undefined, tags: Array.isArray(p.tags) ? p.tags : p.tags ? [p.tags] : [], notes: one(p.notes), props: more };
	};
	const snapshots = (path: string): ScrivSnapshot[] => {
		const dir = `${b.folder}/Snapshots/${path.slice(b.folder.length + 1).replace(/\.md$/, '')}/`, out: ScrivSnapshot[] = [];
		for (const [p, d] of files) {
			if (!p.startsWith(dir) || !p.endsWith('.snapshot') || typeof d !== 'string' || p.slice(dir.length).includes('/')) continue;
			const named = readSnapshotName(p.slice(dir.length).replace(/\.snapshot$/, ''));
			if (named) out.push({ title: named.title, when: named.when.getTime(), text: readSnapshot(d).body });
		}
		return out;
	};
	const item = (it: SourceItem): ScrivItem => (it.kind === 'folder'
		? { ...it, ...card(`${it.path}/${it.name}.md`), text: parts(text(`${it.path}/${it.name}.md`)).body, children: (it.children ?? []).map(item) }
		: { ...it, ...card(it.path), snapshots: snapshots(it.path) });
	const own = [...files.keys()].find((p) => p.startsWith(b.folder + '/') && !p.slice(b.folder.length + 1).includes('/') && /^binder:/m.test(parts(text(p)).yaml)) ?? `${b.folder}/${b.name}.md`;
	return {
		name: b.name, path: b.folder, items: b.items.map(item), labels: DEFAULT_LABELS, statuses: DEFAULT_STATUSES,
		note: { kind: 'note', name: b.name, path: own, included: true, text: parts(text(own)).body, ...card(own), props: {} },
	};
}

/** The pictures of a vault held in memory, as the writer asks for them: by name, wherever they are. */
export const pictureIn = (files: Files): NonNullable<ScrivOptions['picture']> => (src) => {
	const name = src.split(/[#|]/)[0].trim(), hit = files.has(name) ? name : [...files.keys()].find((p) => p.endsWith('/' + name));
	const d = hit ? files.get(hit) : null, picture = d instanceof Uint8Array ? pictureOf(d) : null;
	return picture && hit ? { picture, name: hit } : null;
};

// ---- what can be checked of a project without Scrivener ----

export interface El { name: string; attrs: Record<string, string>; children: El[]; text: string }
/** A small XML reader, enough for these files: elements, attributes, text, CDATA. It throws at what doesn't parse. */
export function parseXml(src: string): El {
	const root: El = { name: '#root', attrs: {}, children: [], text: '' }, stack = [root];
	const re = /<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([^\s>]+)\s*>|<([^\s>/]+)((?:\s+[^\s=>/]+\s*=\s*"[^"]*")*)\s*(\/?)>|[^<]+|</g;
	for (const m of src.matchAll(re)) {
		const top = stack[stack.length - 1];
		if (m[1]) { if (top.name !== m[1]) throw new Error(`</${m[1]}> closes <${top.name}>`); stack.pop(); }
		else if (m[2]) {
			const el: El = { name: m[2], attrs: {}, children: [], text: '' };
			for (const a of m[3].matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)) el.attrs[a[1]] = a[2];
			top.children.push(el);
			if (!m[4]) stack.push(el);
		} else if (m[0].startsWith('<![CDATA[')) top.text += m[0].slice(9, -3);
		else if (m[0] === '<') throw new Error('a < that opens nothing');
		else if (!m[0].startsWith('<')) { if (/&(?!(amp|lt|gt|quot|apos);)/.test(m[0])) throw new Error('a bare &'); top.text += m[0]; }
	}
	if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> is never closed`);
	return root.children[0];
}
const kids = (el: El | undefined, name: string): El[] => (el?.children ?? []).filter((c) => c.name === name);
const kid = (el: El | undefined, name: string): El | undefined => kids(el, name)[0];
export const unxml = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Braces balance, nothing after the last one, ASCII only. */
export function rtfProblem(s: string): string | null {
	if (!s.startsWith('{\\rtf1')) return 'does not start with {\\rtf1';
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c > 126 || (c < 32 && c !== 10)) return `byte ${c} at ${i}`;
		if (s[i] === '\\') { i++; continue; }
		if (s[i] === '{') depth++;
		else if (s[i] === '}') { depth--; if (depth < 0) return `a } too many at ${i}`; if (depth === 0 && i !== s.length - 1) return 'text after the last }'; }
	}
	return depth === 0 ? null : `${depth} unclosed {`;
}

/** An item of a project's tree, read back. */
export interface Read { id: string; type: string; title: string; depth: number; parent: string | null; path: string; included: boolean; label: string | null; status: string | null; section: string | null }

/** A project's files checked against themselves: what is wrong with it, a line each, and its tree as it was read. */
export function checkProject(files: Map<string, Uint8Array>, name: string): { problems: string[]; items: Read[]; root: El | null } {
	const problems: string[] = [], bad = (cond: unknown, msg: string) => { if (!cond) problems.push(msg); };
	const str = (path: string) => { const d = files.get(path); return d ? strFromU8(d) : null; };
	let root: El | null = null;
	for (const path of files.keys()) if (/\.(scrivx|xml)$/.test(path)) { try { const el = parseXml(str(path) ?? ''); if (path.endsWith('.scrivx')) root = el; } catch (e) { problems.push(`${path}: ${e instanceof Error ? e.message : String(e)}`); } }
	const scrivx = str(`${name}.scrivx`);
	bad(scrivx !== null, 'the .scrivx is named like the folder');
	if (!scrivx || !root) return { problems, items: [], root };
	bad(!scrivx.includes('\r') && !scrivx.startsWith('\uFEFF'), '.scrivx: LF, no byte order mark');
	bad(root.name === 'ScrivenerProject' && root.attrs.Version === '2.0', 'root is ScrivenerProject Version="2.0"');
	bad(str('Files/version.txt') === '23', 'Files/version.txt is 23');
	const items: Read[] = [], dateRe = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4}$/;
	const collect = (el: El | undefined, depth: number, parent: string | null) => {
		for (const bi of kids(el, 'BinderItem')) {
			const md = kid(bi, 'MetaData'), path = kids(kid(md, 'CustomMetaData'), 'MetaDataItem').find((f) => kid(f, 'FieldID')?.text === 'binderspath');
			bad(dateRe.test(bi.attrs.Created) && dateRe.test(bi.attrs.Modified), `${bi.attrs.UUID}: dates in Scrivener's form`);
			items.push({ id: bi.attrs.UUID, type: bi.attrs.Type, title: unxml(kid(bi, 'Title')?.text ?? ''), depth, parent, path: unxml(kid(path, 'Value')?.text ?? ''), included: kid(md, 'IncludeInCompile')?.text === 'Yes', label: kid(md, 'LabelID')?.text ?? null, status: kid(md, 'StatusID')?.text ?? null, section: kid(md, 'SectionType')?.text ?? null });
			bad(!kid(md, 'IncludeInCompile') || kid(md, 'IncludeInCompile')?.text === 'Yes', `${bi.attrs.UUID}: left out is said by leaving the element out`);
			for (const k of kids(kid(bi, 'Keywords'), 'KeywordID')) bad(kids(kid(root as El, 'Keywords'), 'Keyword').some((d) => d.attrs.ID === k.text), `keyword ${k.text} is defined`);
			for (const f of kids(kid(md, 'CustomMetaData'), 'MetaDataItem')) bad(kids(kid(root as El, 'CustomMetaDataSettings'), 'MetaDataField').some((d) => d.attrs.ID === kid(f, 'FieldID')?.text), `field ${kid(f, 'FieldID')?.text} is defined`);
			collect(kid(bi, 'Children'), depth + 1, bi.attrs.UUID);
		}
	};
	collect(kid(root, 'Binder'), 0, null);
	bad(items.filter((i) => i.depth === 0).map((i) => i.type).join() === 'DraftFolder,ResearchFolder,TrashFolder', 'top of the binder is Draft, Research, Trash');
	bad(items.filter((i) => /^(Draft|Research|Trash)Folder$/.test(i.type)).length === 3, 'no second Draft, Research or Trash below the top');
	const ids = items.map((i) => i.id), idSet = new Set(ids);
	bad(idSet.size === ids.length, 'no id twice');
	bad(ids.every((u) => /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(u)), 'ids are upper-case UUIDs');
	bad(dateRe.test(root.attrs.Modified), 'project Modified date');
	for (const path of files.keys()) {
		const data = /^Files\/Data\/([^/]+)\//.exec(path), snap = /^Snapshots\/([^/]+)\.snapshots\//.exec(path);
		if (data) bad(idSet.has(data[1]), `${path} belongs to no item of the tree`);
		if (snap) bad(idSet.has(snap[1]), `${path} belongs to no item of the tree`);
		if (!data && !snap) bad(/^(Files\/(version\.txt|styles\.xml)|Settings\/compile\.xml|[^/]+\.scrivx)$/.test(path), `${path} is no file of a project`);
	}
	const labelIds = kids(kid(kid(root, 'LabelSettings'), 'Labels'), 'Label').map((l) => l.attrs.ID), statusIds = kids(kid(kid(root, 'StatusSettings'), 'StatusItems'), 'Status').map((l) => l.attrs.ID);
	const typeIds = kids(kid(kid(root, 'SectionTypes'), 'TypeDefinitions'), 'Type').map((t) => t.attrs.ID);
	bad(new Set(labelIds).size === labelIds.length && new Set(statusIds).size === statusIds.length && new Set(typeIds).size === typeIds.length, 'no label, status or section type twice');
	for (const i of items) {
		if (i.label !== null) bad(labelIds.includes(i.label), `label ${i.label} is defined`);
		if (i.status !== null) bad(statusIds.includes(i.status), `status ${i.status} is defined`);
		if (i.section !== null) bad(typeIds.includes(i.section), `section type ${i.section} is defined`);
	}
	for (const lv of kid(kid(root, 'SectionTypes'), 'LevelTypes')?.children ?? []) for (const t of lv.children) bad(typeIds.includes(t.text), `section type ${t.text} is defined`);
	for (const m of (str('Settings/compile.xml') ?? '').matchAll(/<Type ID="([^"]+)"/g)) bad(typeIds.includes(m[1]), `compile.xml: section type ${m[1]} is defined`);
	for (const [path, data] of files) {
		if (path.endsWith('/index.xml')) { const dir = path.slice(0, -9), n = (strFromU8(data).match(/<Snapshot>/g) ?? []).length; bad([...files.keys()].filter((p) => p.startsWith(dir) && p.endsWith('.rtf')).length === n, `${dir}: one .rtf per snapshot in the index`); }
		if (!path.endsWith('.rtf')) continue;
		const s = strFromU8(data, true), wrong = rtfProblem(s);
		bad(!wrong, `${path}: ${wrong}`);
		for (const m of s.matchAll(/scrivlnk:\/\/([0-9A-F-]+)/g)) bad(idSet.has(m[1]), `${path}: a link to ${m[1]}, which is no item`);
		// (a paragraph begun with a tab arrives with a first-line indent: a tab is only in a list, and in code)
		bad(!/\\pard(?:\\(?:li|ri|sa|fi)-?\d+)* \\tab /.test(s), `${path}: a paragraph that starts with a tab`);
	}
	return { problems, items, root };
}
