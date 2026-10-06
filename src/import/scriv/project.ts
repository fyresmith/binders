import { FORMAT } from '../../export/scriv/parts';
import { utf8, type ProjectSource } from '../source';
import { child, children, readXml, value, type Element } from './xml';

/* A Scrivener 3 project's index (its `.scrivx`) read: the binder's items in their order, and the lists an item
   names things from (labels, statuses, custom fields, keywords, section types). The documents' own files are not
   read here: plan.ts asks for each as it places it. Pure; the same format src/export/scriv writes. */

/** An item of the project's binder: a document, a folder, or one of its three roots. */
export interface ReadItem {
	/** Its UUID, in upper case: the name of its folder in "Files/Data". */
	id: string;
	/** "Text", "Folder", "DraftFolder", "ResearchFolder", "TrashFolder", "PDF", "Image"... */
	type: string;
	title: string;
	children: ReadItem[];
	/** "Include in compile". */
	included: boolean;
	/** The ids of its label, status and section type in the project's lists; "" or "-1" for none. */
	label: string; status: string; section: string;
	target: number; targetType: string;
	/** Custom metadata, as the field's title and its value. */
	fields: [string, string][];
	keywords: string[];
	/** The file a document that isn't text is ("pdf", "png"). */
	extension: string;
}
export interface ReadProject {
	source: ProjectSource;
	roots: ReadItem[];
	labels: Map<string, { name: string; color: string }>;
	statuses: Map<string, string>; fields: Map<string, string>; keywords: Map<string, string>; sections: Map<string, string>;
	/** The draft's target in words, or 0. */
	target: number;
}

/** A color as Scrivener writes one ("0.36 0.55 0.84") as "#5c8cd6"; "" for one that isn't three numbers from 0 to 1. */
function hex(color: string): string {
	const floats = color.trim().split(/\s+/).map(Number);
	return floats.length === 3 && floats.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ? '#' + floats.map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join('') : '';
}

export function readProject(source: ProjectSource): ReadProject {
	const index = [...source.files.keys()].find((p) => /\.scrivx$/i.test(p)), root = readXml(utf8(source.files.get(index)));
	// A project says what it is twice: the index's own version (2.0 in Scrivener 3; Scrivener 1 and 2 wrote 1.0), and
	// the number in "Files/version.txt". Anything else is not read as if it were: a guess here is writing lost.
	const older = new Error('This project is from an older Scrivener. Open it in Scrivener 3, which brings it up to date, then import it.');
	const newer = new Error('This project is from a newer Scrivener than Binders can read. Nothing was imported.');
	if (root.name !== 'ScrivenerProject') throw new Error('This isn’t a Scrivener project: its .scrivx file is something else.');
	if (root.attrs.Version !== '2.0') throw Number(root.attrs.Version) > 2 ? newer : older;
	const version = source.files.get('Files/version.txt'), format = version ? utf8(version).trim() : FORMAT;
	if (format !== FORMAT) throw Number(format) < Number(FORMAT) ? older : newer;
	const p: ReadProject = { source, roots: [], labels: new Map(), statuses: new Map(), fields: new Map(), keywords: new Map(), sections: new Map(), target: 0 };
	// ("-1" is "No label" and "No status": the absence of one, not one)
	for (const el of children(child(child(root, 'LabelSettings'), 'Labels'), 'Label')) if (el.attrs.ID !== '-1') p.labels.set(el.attrs.ID, { name: el.text, color: hex(el.attrs.Color ?? '') });
	for (const el of children(child(child(root, 'StatusSettings'), 'StatusItems'), 'Status')) if (el.attrs.ID !== '-1') p.statuses.set(el.attrs.ID, el.text);
	for (const el of children(child(root, 'CustomMetaDataSettings'), 'MetaDataField')) p.fields.set(el.attrs.ID, value(el, 'Title'));
	const keywords = (el: Element) => { for (const k of children(el, 'Keyword')) { p.keywords.set(k.attrs.ID, value(k, 'Title')); keywords(child(k, 'Children')); } };
	keywords(child(root, 'Keywords'));
	for (const el of children(child(child(root, 'SectionTypes'), 'TypeDefinitions'), 'Type')) p.sections.set(el.attrs.ID, el.text);

	const damaged = () => new Error('The project’s list of documents (its .scrivx file) is damaged, so the project can’t be read.');
	const ids = new Set<string>();
	const item = (el: Element): ReadItem => {
		const id = el.attrs.UUID?.toUpperCase(), type = el.attrs.Type, meta = child(el, 'MetaData'), target = child(child(el, 'TextSettings'), 'Target');
		// (an id is a folder's name in the project and a key here: one that isn't a UUID, or is another item's, can't be trusted)
		if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id ?? '') || ids.has(id)) throw damaged();
		ids.add(id);
		if (!type) throw damaged();
		return {
			id, type, title: value(el, 'Title') || 'Untitled',
			children: children(child(el, 'Children'), 'BinderItem').map(item),
			included: value(meta, 'IncludeInCompile') === 'Yes',
			label: value(meta, 'LabelID'), status: value(meta, 'StatusID'), section: value(meta, 'SectionType'),
			target: Number(target?.text) || 0, targetType: target?.attrs.Type ?? '',
			fields: children(child(meta, 'CustomMetaData'), 'MetaDataItem').map((f): [string, string] => [p.fields.get(value(f, 'FieldID')) ?? value(f, 'FieldID'), value(f, 'Value')]),
			keywords: children(child(el, 'Keywords'), 'KeywordID').map((k) => p.keywords.get(k.text) ?? k.text),
			extension: value(meta, 'FileExtension'),
		};
	};
	p.roots = children(child(root, 'Binder'), 'BinderItem').map(item);
	const roots = (type: string) => p.roots.filter((i) => i.type === type).length;
	if (roots('DraftFolder') !== 1) throw new Error('This project has no Draft folder, or more than one, so there is no manuscript to bring in.');
	if (roots('ResearchFolder') > 1 || roots('TrashFolder') > 1) throw damaged();
	const target = child(child(root, 'ProjectTargets'), 'DraftTarget');
	if (target?.attrs.Type === 'Words') p.target = Number(target.text) || 0;
	return p;
}
