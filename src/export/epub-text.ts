import { esc } from './docx-parts';
import { plain, type Block, type Book, type Inline, type Picture, type Section, type Text } from './model';
import { against, bookHeading, bookWord, type BookStyle } from './style';

/* A section of the book as the XHTML an ebook holds: its heading as the style sets it, its text, and its footnotes
   under it as the notes a reader pops up. Text only: the package around it is epub.ts, the look is epub-css.ts. Pure. */

/** The first words of a chapter, which a style may set in small capitals: four, when the paragraph goes on after
    them. Null when there aren't four words and more (a script without spaces has none). */
export function leadWords(text: string): [lead: string, rest: string] | null {
	const m = /^((?:\S+\s+){3}\S+)(\s[\s\S]*)$/.exec(text);
	return m ? [m[1], m[2]] : null;
}

/** Whether a chapter's first paragraph begins with words that can be set apart: plain text, no link. */
export const leads = (r: Inline | undefined): r is Text => !!r && r.kind === 'text' && !r.i && !r.b && !r.s && !r.code && !r.href && !r.at;

/** A chapter's first paragraph with its first words apart: the words, and the rest of its runs. Null when it doesn't
    begin with four plain words and more (a link that leads nowhere is only its words, and plain). */
export function leadSplit(runs: readonly Inline[]): [lead: string, rest: Inline[]] | null {
	let n = 0, text = '';
	while (n < runs.length && leads(runs[n])) text += (runs[n++] as Text).text;
	const m = leadWords(text);
	return m ? [m[0], [{ kind: 'text', text: m[1] }, ...runs.slice(n)]] : null;
}

const ROLE: Record<string, string> = { prologue: 'doc-prologue', epilogue: 'doc-epilogue', introduction: 'doc-introduction', foreword: 'doc-foreword', preface: 'doc-preface', afterword: 'doc-afterword' };
const MATTER: Record<string, [type: string, role: string]> = {
	'title-page': ['titlepage', ''], copyright: ['copyright-page', ''], dedication: ['dedication', 'doc-dedication'], epigraph: ['epigraph', 'doc-epigraph'],
	acknowledgements: ['acknowledgments', 'doc-acknowledgments'], 'about-the-author': ['', ''], 'also-by': ['', ''], contents: ['toc', ''],
};
/** What a section is, as an ebook says it: `epub:type` and the ARIA role, either "" when there is no word for it. */
export function semantics(s: Section): [type: string, role: string] {
	if (s.role === 'part') return ['part', 'doc-part'];
	if (s.role === 'chapter') { const named = ROLE[s.title.trim().toLowerCase()]; return named ? [named.slice(4), named] : ['chapter', 'doc-chapter']; }
	return (s.matter && MATTER[s.matter]) || ['', ''];
}

/** Where a picture is in the ebook, given once however often it is shown. */
export class Pictures {
	private at = new Map<Uint8Array, string>();
	list: { name: string; picture: Picture }[] = [];
	name(p: Picture): string {
		let name = this.at.get(p.data);
		if (!name) { name = `img-${this.list.length + 1}.${p.type === 'jpeg' ? 'jpg' : p.type}`; this.at.set(p.data, name); this.list.push({ name, picture: p }); }
		return name;
	}
}

/** What writing the sections shares: the pictures, and the section each footnote is set under (that of its first mark). */
export interface Shared { book: Book; style: BookStyle; pictures: Pictures; home: Map<number, string>; file: (id: string) => string }

/** A section's heading, each of its lines a span a style can set apart. */
export const headingHtml = (lines: readonly string[]): string => lines.map((l, i) => `<span class="hl hl${Math.min(i, 1)}">${esc(l)}</span>`).join(' ');

/** A section as the body of its file. */
export function sectionHtml(s: Section, x: Shared): string {
	const { book, style } = x, here: number[] = [], shown = new Map<number, number>(), marks = new Map<number, number>();
	const inline = (runs: readonly Inline[], foot: boolean): string => runs.map((r) => {
		if (r.kind === 'br') return '<br/>';
		if (r.kind === 'note') {
			// (a note can't carry a note a reader could open: its words are set in the note, in brackets)
			if (foot) { const n = book.notes[r.note]; return n ? ` [${n.map((b) => (b.kind === 'p' || b.kind === 'heading' ? inline(b.runs, true) : '')).filter((t) => t).join(' ')}]` : ''; }
			if (!book.notes[r.note]) return '';
			if (!x.home.has(r.note)) { x.home.set(r.note, s.id); here.push(r.note); shown.set(r.note, here.length); }
			const times = (marks.get(r.note) ?? 0) + 1, away = x.home.get(r.note) !== s.id;
			marks.set(r.note, times);
			const id = away ? `r${r.note + 1}-${s.id}-${times}` : times > 1 ? `r${r.note + 1}-${times}` : `r${r.note + 1}`;
			return `<a class="noteref" epub:type="noteref" role="doc-noteref" id="${id}" href="${away ? x.file(x.home.get(r.note) ?? '') : ''}#n${r.note + 1}">${shown.get(r.note) ?? '*'}</a>`;
		}
		let t = esc(r.text);
		if (r.code) t = `<code>${t}</code>`;
		if (r.s) t = `<del>${t}</del>`;
		if (r.b) t = `<strong>${t}</strong>`;
		if (r.i) t = `<em>${t}</em>`;
		if (r.href) return `<a href="${esc(r.href)}">${t}</a>`;
		if (r.at && r.at !== s.id) return `<a href="${x.file(r.at)}">${t}</a>`;
		return t;
	}).join('');

	/** A paragraph or heading in a script that runs the other way from the book's takes its own direction. */
	const dir = (runs: readonly Inline[]) => (against(plain(runs), book.language) ? ' dir="auto"' : '');

	/** `first`: the paragraph follows a heading or a break (no indent). `lead`: it opens a chapter. */
	const flow = (blocks: readonly Block[], foot: boolean, opening: boolean, mark = ''): string => {
		const out: string[] = [];
		let first = true, lead = opening && s.role === 'chapter' && style['first-words'] === 'small capitals';
		for (const b of blocks) {
			if (b.kind === 'p') {
				const split = lead ? leadSplit(b.runs) : null;
				const text = split ? `<span class="lead">${esc(split[0])}</span>${inline(split[1], foot)}` : inline(b.runs, foot);
				out.push(`<p${first ? ' class="first"' : ''}${dir(b.runs)}>${mark}${text}</p>`);
				mark = '';
			} else if (b.kind === 'break') out.push(`<p class="break" role="separator">${style['scene-break'] ? esc(style['scene-break']).replace(/ /g, '&#160;') : '&#160;'}</p>`);
			else if (b.kind === 'heading') { const h = `h${Math.min(4, Math.max(2, b.level))}`; out.push(`<${h}${dir(b.runs)}>${inline(b.runs, foot)}</${h}>`); }
			else if (b.kind === 'quote') out.push(`<blockquote>${b.title ? `<p class="first"><strong>${inline(b.title, foot)}</strong></p>` : ''}${flow(b.blocks, foot, false)}</blockquote>`);
			else if (b.kind === 'list') out.push(`<${b.ordered ? `ol${b.start !== 1 ? ` start="${b.start}"` : ''}` : 'ul'}>${b.items.map((item) => `<li>${flow(item, foot, false)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`);
			else if (b.kind === 'table' && b.rows.length) {
				const row = (cells: Inline[][], tag: string) => `<tr>${cells.map((c, i) => `<${tag}${b.align[i] ? ` class="${b.align[i]}"` : ''}>${inline(c, foot)}</${tag}>`).join('')}</tr>`;
				out.push(`<table><thead>${row(b.rows[0], 'th')}</thead>${b.rows.length > 1 ? `<tbody>${b.rows.slice(1).map((r) => row(r, 'td')).join('')}</tbody>` : ''}</table>`);
			} else if (b.kind === 'code') out.push(`<pre><code>${esc(b.text)}</code></pre>`);
			else if (b.kind === 'image' && b.picture) out.push(`<figure><img src="../images/${x.pictures.name(b.picture)}" alt="${esc(b.alt)}"${b.alt ? '' : ' role="presentation"'}/></figure>`);
			else continue;
			first = b.kind === 'break' || b.kind === 'heading';
			lead = false;
		}
		if (mark) out.unshift(`<p class="first">${mark}</p>`);
		return out.join('\n');
	};

	const [type, role] = semantics(s), lines = bookHeading(style, s, book.language);
	const open = `<section${type ? ` epub:type="${type}"` : ''}${role ? ` role="${role}"` : ''}${lines.length ? ' aria-labelledby="h"' : ''} class="${s.role}${s.matter ? ` ${s.matter}` : ''}${s.made ? ' made' : ''}">`;
	const body = flow(s.blocks, false, true);
	const notes = here.length ? `\n<section class="notes" epub:type="footnotes" role="doc-endnotes"${bookWord('notes', book.language) ? ` aria-label="${esc(bookWord('notes', book.language))}"` : ''}>\n${here.map((n) => `<aside epub:type="footnote" role="doc-footnote" id="n${n + 1}">\n${flow(book.notes[n], true, false, `<a href="#r${n + 1}" role="doc-backlink">${shown.get(n) ?? ''}</a> `)}\n</aside>`).join('\n')}\n</section>` : '';
	return `${open}\n${lines.length ? `<h1 id="h">${headingHtml(lines)}</h1>\n` : ''}${body}${notes}\n</section>`;
}

/** The title page Binders makes: the title, the subtitle, the author, and no word of Binders' own. */
export function titlePageHtml(book: Book): string {
	return `<section class="titlepage" epub:type="titlepage" aria-labelledby="h">\n<h1 id="h">${esc(book.title)}</h1>${book.subtitle ? `\n<p class="subtitle">${esc(book.subtitle)}</p>` : ''}${book.author.trim() ? `\n<p class="author">${esc(book.author.trim())}</p>` : ''}\n</section>`;
}
