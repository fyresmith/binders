import type { Para, Run, SourceDoc } from '../import/doc';
import type { DocxFile, DocxMark, DocxPara, DocxRun, Rev } from './read';

/* A file's revisions settled one way or the other, and its paragraphs made the importer's: `settle(file, 'final')` is
   what import calls (every tracked change accepted); 'original' is the file as it was before any. Comments are left
   out (counted, and said): a later step brings them in. Pure. */

const isRun = (r: DocxRun | DocxMark): r is DocxRun => !('id' in r && /^comment/.test(r.kind));
const gone = (rev: Rev | undefined, as: 'final' | 'original'): boolean => !!rev && (as === 'final' ? rev.kind === 'del' || rev.kind === 'moveFrom' : rev.kind === 'ins' || rev.kind === 'moveTo');

export function settle(file: DocxFile, as: 'final' | 'original'): SourceDoc {
	const notes: Para[][] = [], order = new Map<number, number>();
	const underline = file.found.underlined > 0 && file.found.italic === 0;
	const kept = (p: DocxPara): DocxRun[] => p.runs.filter(isRun).filter((r) => !gone(r.rev, as));

	const convert = (p: DocxPara, runs: DocxRun[], deep: boolean): Para => {
		const out: Run[] = [];
		let leadTab = false, pageFirst = false;
		for (const r of runs) {
			if (r.kind === 'text') {
				if (!r.text) continue;
				out.push({ kind: 'text', text: r.text, b: r.b, i: r.i || (underline && r.u), s: r.s, ...(r.href ? { href: r.href } : {}) });
			} else if (r.kind === 'tab') {
				// a tab that starts a paragraph is the writer's first-line tab; any other is a space
				if (!out.some((x) => x.kind !== 'br' && !(x.kind === 'text' && !x.text.trim()))) leadTab = true; else out.push({ kind: 'text', text: ' ', b: false, i: false, s: false });
			} else if (r.kind === 'br') { if (!r.page) out.push({ kind: 'br' }); else if (!out.some((x) => x.kind === 'text' && x.text.trim())) pageFirst = true; }
			else if (r.kind === 'picture') out.push({ kind: 'picture' });
			else if (r.kind === 'note') {
				if (deep) continue; // (a footnote can't hold another: its words are the text's)
				const id = r.end ? -1 - r.id : r.id, list = file.notes.get(id);
				if (!list) continue;
				let at = order.get(id);
				if (at === undefined) {
					at = notes.length;
					order.set(id, at);
					notes.push([]);
					notes[at] = list.map((n) => convert(n, kept(n), true));
				}
				out.push({ kind: 'note', note: at });
			}
		}
		return { runs: out, style: p.style, outline: p.outline, align: p.align, pageBefore: p.pageBefore || pageFirst, indent: p.indent, list: p.list ? { level: p.list.level, ordered: p.list.ordered } : null, leadTab, toc: p.toc, inTable: p.inTable };
	};

	const paras: Para[] = [];
	let carry: DocxRun[] = [];
	let page = false;
	for (const p of file.paras) {
		const runs = [...carry, ...kept(p)];
		carry = [];
		// a paragraph mark that was deleted joins what is left of it to the next paragraph
		if (gone(p.markRev, as)) { carry = runs; page ||= p.pageBefore; continue; }
		const para = convert(p, runs, false);
		if (page) para.pageBefore = true;
		page = false;
		// a paragraph whose every run was a deletion is not an empty paragraph the writer typed
		if (!para.runs.length && p.runs.some((r) => isRun(r) && gone(r.rev, as))) { page ||= para.pageBefore; continue; }
		paras.push(para);
		// a page break that ends a paragraph starts the next on a new page
		const last = [...p.runs].reverse().find(isRun);
		if (last && last.kind === 'br' && last.page && para.runs.length) page = true;
	}
	if (carry.length) paras.push(convert(file.paras[file.paras.length - 1], carry, false));

	const revisions = file.found.inserted + file.found.deleted;
	const said: string[] = [];
	if (revisions) said.push(`This file has ${revisions.toLocaleString()} tracked ${revisions === 1 ? 'change' : 'changes'}. ${as === 'final' ? 'They are brought in as accepted.' : 'They are left out, as if rejected.'}`);
	if (file.found.comments) said.push(`This file has ${file.found.comments.toLocaleString()} ${file.found.comments === 1 ? 'comment' : 'comments'} in its margin. They aren’t brought in.`);
	if (file.found.tables) said.push('A table comes in as its text, cell after cell: its layout isn’t kept.');
	if (file.found.textBoxes) said.push('The text in a text box comes in once, where the box is.');
	if (file.found.headers) said.push('Headers and footers aren’t brought in.');
	if (file.found.pictures) said.push('Pictures aren’t brought in yet.');
	if (file.found.endnotes) said.push('Endnotes come in as footnotes.');
	if (underline) said.push('Underlined text is read as italics: the file has no italics of its own.');
	return { producer: file.producer, paras, notes, found: { revisions, comments: file.found.comments, underlined: underline, headers: file.found.headers, textBoxes: file.found.textBoxes, tables: file.found.tables, pictures: file.found.pictures, endnotes: file.found.endnotes }, said };
}
