import type { Para, Run, SourceDoc } from '../import/doc';
import type { DocxFile, DocxMark, DocxPara, DocxRun, Rev } from './read';

/* A file's revisions settled one way or the other, and its paragraphs made the importer's: `settle(file, 'final')` is
   what import calls (every tracked change accepted); 'original' is the file as it was before any. What else the writer
   chooses is here too: whether the comments in the margin come in (as `{kind: 'comment'}` runs, at the end of the words
   they are on), and whether underlined text is read as italics when the file has italics of its own. Pictures: PNG and
   JPEG are kept (by their index in `SourceDoc.pictures`, which hands out their bytes only when asked), others counted. Pure. */

export interface SettleOptions { underline?: 'plain' | 'italic'; comments?: boolean }

const isMark = (r: DocxRun | DocxMark): r is DocxMark => /^comment/.test(r.kind);
const gone = (rev: Rev | undefined, as: 'final' | 'original'): boolean => !!rev && (as === 'final' ? rev.kind === 'del' || rev.kind === 'moveFrom' : rev.kind === 'ins' || rev.kind === 'moveTo');

export function settle(file: DocxFile, as: 'final' | 'original', o: SettleOptions = {}): SourceDoc {
	const notes: Para[][] = [], order = new Map<number, number>();
	const pictures: SourceDoc['pictures'] = [], pictureAt = new Map<string, number>();
	let otherPictures = 0;
	const hasUnderline = file.found.underlined > 0, hasItalic = file.found.italic > 0;
	// underlining is the manuscript way of writing italics: read as italics when the file has none, and when the writer says so
	const underline = hasUnderline && (!hasItalic || o.underline === 'italic');
	const withComments = o.comments !== false;
	const kept = (p: DocxPara): (DocxRun | DocxMark)[] => p.runs.filter((r) => isMark(r) || !gone(r.rev, as));

	const convert = (p: DocxPara, runs: (DocxRun | DocxMark)[], deep: boolean): Para => {
		const out: Run[] = [];
		let leadTab = false, pageFirst = false;
		for (const r of runs) {
			if (isMark(r)) {
				if (r.kind === 'comment-end' && withComments && !deep) {
					const c = file.comments.get(r.id);
					if (c?.text) out.push({ kind: 'comment', text: c.author ? `${c.author}: ${c.text}` : c.text });
				}
				continue;
			}
			if (r.kind === 'text') {
				if (!r.text) continue;
				out.push({ kind: 'text', text: r.text, b: r.b, i: r.i || (underline && r.u), s: r.s, ...(r.href ? { href: r.href } : {}) });
			} else if (r.kind === 'tab') {
				// a tab that starts a paragraph is the writer's first-line tab; any other is a space
				if (!out.some((x) => x.kind !== 'br' && !(x.kind === 'text' && !x.text.trim()))) leadTab = true; else out.push({ kind: 'text', text: ' ', b: false, i: false, s: false });
			} else if (r.kind === 'br') { if (!r.page) out.push({ kind: 'br' }); else if (!out.some((x) => x.kind === 'text' && x.text.trim())) pageFirst = true; }
			else if (r.kind === 'picture') {
				const found = r.rid && !deep ? file.picture(r.rid) : null;
				if (found && /^(png|jpe?g)$/.test(found.ext)) {
					let at = pictureAt.get(r.rid ?? '');
					if (at === undefined) { at = pictures.length; pictureAt.set(r.rid ?? '', at); pictures.push({ ext: found.ext === 'jpg' ? 'jpeg' : found.ext, load: () => found.load() }); }
					out.push({ kind: 'picture', index: at });
				} else otherPictures++;
			}
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
		return { runs: out, style: p.style, outline: p.outline, align: p.align, pageBefore: p.pageBefore || pageFirst, indent: p.indent, list: p.list ? { level: p.list.level, ordered: p.list.ordered } : null, leadTab, toc: p.toc, inTable: p.inTable, numbered: p.numbered };
	};

	const paras: Para[] = [];
	let carry: (DocxRun | DocxMark)[] = [];
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
		if (!para.runs.length && p.runs.some((r) => !isMark(r) && gone(r.rev, as))) { page ||= para.pageBefore; continue; }
		paras.push(para);
		// a page break that ends a paragraph starts the next on a new page
		const last = [...p.runs].reverse().find((r): r is DocxRun => !isMark(r));
		if (last && last.kind === 'br' && last.page && para.runs.length) page = true;
	}
	if (carry.length) paras.push(convert(file.paras[file.paras.length - 1], carry, false));

	const revisions = file.found.inserted + file.found.deleted, comments = file.comments.size ? Math.max(file.found.comments, 0) : file.found.comments;
	const said: string[] = [];
	if (revisions) said.push(`This file has ${revisions.toLocaleString()} tracked ${revisions === 1 ? 'change' : 'changes'}. ${as === 'final' ? 'They are brought in as accepted.' : 'They are left out, as if rejected.'}`);
	if (comments) said.push(`This file has ${comments.toLocaleString()} ${comments === 1 ? 'comment' : 'comments'} in its margin. ${withComments ? 'They are kept as Obsidian comments, at the end of the words they are on.' : 'They are left out.'}`);
	if (file.found.tables) said.push('A table comes in as its text, cell after cell: its layout isn’t kept.');
	if (file.found.textBoxes) said.push('The text in a text box comes in once, where the box is.');
	if (file.found.headers) said.push('Headers and footers aren’t brought in.');
	if (pictures.length) said.push(`${pictures.length.toLocaleString()} ${pictures.length === 1 ? 'picture is' : 'pictures are'} kept as files in Research/Attachments, where each stood.`);
	if (otherPictures) said.push(`${otherPictures.toLocaleString()} ${otherPictures === 1 ? 'picture' : 'pictures'} of a kind other than PNG or JPEG ${otherPictures === 1 ? 'isn’t' : 'aren’t'} brought in.`);
	if (file.found.endnotes) said.push('Endnotes come in as footnotes.');
	if (underline) said.push(hasItalic ? 'Underlined text is made italic, as you chose.' : 'Underlined text is read as italics: the file has no italics of its own.');
	return { producer: file.producer, paras, notes, pictures, found: { revisions, comments, underlined: underline, hasUnderline, hasItalic, headers: file.found.headers, textBoxes: file.found.textBoxes, tables: file.found.tables, pictures: pictures.length, otherPictures, endnotes: file.found.endnotes }, said };
}
