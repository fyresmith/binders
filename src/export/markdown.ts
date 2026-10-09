import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFootnoteFromMarkdown } from 'mdast-util-gfm-footnote';
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmFootnote } from 'micromark-extension-gfm-footnote';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { CODE, lf, parts } from '../scene-text';
import type { Block, Inline, Text } from './model';

/* A note's text read for a book. Markdown is read by a real parser (micromark, with footnotes, tables and
   strikethrough); what is Obsidian's own (wikilinks, embeds, comments, highlights, inline footnotes, block ids, tags,
   callouts, math) is taken out of the text first and put back as the model has it. The table in docs/dev/export.md, "What
   Markdown becomes", is this file row by row. Pure.

   Three things are read differently from Markdown, on purpose:
     - a new line is a new paragraph (fiction is typed a paragraph to a line);
     - only a fenced block is code: a line begun with a tab or with spaces is a paragraph, and its indent is dropped
       (the style gives the indent). These are the lines `tabLines` in paragraphs/text.ts names, and more;
     - a rule under a line of text is a scene break, never a heading made of the line above it. */

/** A note, read: its blocks, its footnotes in the order their marks come (a mark is its place here), and what had to
    be left out or changed, a sentence each. */
export interface Parsed { blocks: Block[]; notes: Block[][]; warnings: string[] }

/** What was taken out of the text before Markdown read it. */
type Held = { kind: 'link'; target: string; shown: string } | { kind: 'embed'; target: string } | { kind: 'math'; text: string };

const OPEN = '', CLOSE = '', HELD = /(\d+)/;
const TAG = /(^|\s)#(?=[^\s#]*[^\d\s#])[\p{L}\p{N}_/-]+/u;
const TAGS_ONLY = /^[ \t]*(?:#(?=[^\s#]*[^\d\s#])[\p{L}\p{N}_/-]+[ \t]*)+$/u;
const BLOCK_ID = /(^|[ \t])\^[A-Za-z0-9-]+[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** A minimal view of a syntax tree's node: what this file reads of it. */
interface Node { type: string; value?: string; children?: Node[]; depth?: number; ordered?: boolean; start?: number | null; url?: string; alt?: string | null; identifier?: string; align?: ('left' | 'center' | 'right' | null)[] }

const tree = (text: string): Node => fromMarkdown(text, {
	extensions: [gfmFootnote(), gfmTable(), gfmStrikethrough(), { disable: { null: ['codeIndented', 'setextUnderline'] } }],
	mdastExtensions: [gfmFootnoteFromMarkdown(), gfmTableFromMarkdown(), gfmStrikethroughFromMarkdown()],
});

/** A wikilink's words when it gives none: the note's name, and the part of it after `#`. */
function shownFor(target: string): string {
	const [note, ...sub] = target.split('#');
	const name = note.split('/').pop() ?? note;
	return [name, ...sub].map((s) => s.trim()).filter((s) => s).join(' > ');
}

/** A text without its comments, as `stripComments` leaves it, and without the hole one leaves in a sentence: a
    comment between two words stood between two spaces, and a book has one there. A space on one side only stays as
    it was (nothing is joined, nothing parted); at the start of a line the indent before it stays (a paragraph begun
    with a tab) and the space after it goes; at the end of a line both go, unless they are the two spaces that break
    a line. Code is left alone, as there. */
function withoutComments(text: string): string {
	// (a run of comments, with only spaces or tabs between, is one comment: two in a row leave one space, not two)
	const one = '(?:%%[\\s\\S]*?%%|<!--[\\s\\S]*?-->)';
	return text.replace(new RegExp(`${CODE}|([ \\t]*)${one}(?:[ \\t]*${one})*([ \\t]*)`, 'gm'), (m: string, ...rest: unknown[]) => {
		const lead = rest[2], trail = rest[3], at = rest[4];
		if (typeof lead !== 'string' || typeof trail !== 'string' || typeof at !== 'number') return m; // (code)
		const first = at === 0 || text[at - 1] === '\n', last = at + m.length === text.length || text[at + m.length] === '\n';
		if (first) return lead;
		if (last) return /^ {2,}$/.test(trail) ? trail : /^ {2,}$/.test(lead) ? lead : '';
		return lead && trail ? ' ' : lead + trail;
	});
}

/** The text with what is Obsidian's own taken out (and kept in `held`), ready for a Markdown parser. */
function prepare(body: string, held: Held[], warnings: Set<string>): string {
	const hold = (h: Held) => `${OPEN}${held.push(h) - 1}${CLOSE}`;
	const outside = (text: string, pattern: string, put: (m: string[]) => string): string =>
		text.replace(new RegExp(`${CODE}|${pattern}`, 'gm'), (...m: string[]) => (m[1] !== undefined || m[2] !== undefined ? m[0] : put(m.slice(3))));
	// (these two characters stand for what is held: a text that has them already loses them, and no word with them)
	let text = withoutComments(lf(body).replace(/[]/g, ''));
	// a highlight is its words
	text = outside(text, '==(?=\\S)([^\\n]*?\\S)==', ([inner]) => inner);
	// links to notes, things embedded, math
	text = outside(text, '(!?)\\[\\[([^\\]\\n]+?)\\]\\]|\\$\\$([\\s\\S]+?)\\$\\$|\\$(?!\\s)([^$\\n]*?[^$\\s])\\$(?!\\d)', ([bang, link, display, math]) => {
		if (link !== undefined) {
			const bar = /\\?\|/.exec(link), target = (bar ? link.slice(0, bar.index) : link).trim(), alias = bar ? link.slice(bar.index + bar[0].length).trim() : '';
			return bang ? hold({ kind: 'embed', target }) : hold({ kind: 'link', target, shown: alias || shownFor(target) });
		}
		warnings.add('Math is exported as it is typed.');
		return hold({ kind: 'math', text: display !== undefined ? `$$${display}$$` : `$${math}$` });
	});
	// a footnote written where it is marked becomes one written out under the text, under a label no writer types:
	// Markdown then reads both kinds the same way (a mark inside one, too)
	const typed: string[] = [];
	text = outside(text, '\\^\\[((?:[^\\[\\]\\n]|\\[[^\\[\\]\\n]*\\])+)\\]', ([note]) => `[^${OPEN}${typed.push(note) - 1}]`);
	// line by line: a block's id is dropped, and so is a line of nothing but tags
	let fence: string | null = null;
	const lines = text.split('\n').map((line) => {
		if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null; return line; }
		const f = FENCE.exec(line);
		if (f) { fence = f[1]; return line; }
		if (TAGS_ONLY.test(line)) return '';
		if (TAG.test(line.replace(new RegExp(CODE, 'g'), ''))) warnings.add('A tag in a line of text is exported as it is typed.');
		return line.replace(BLOCK_ID, '');
	});
	// (a fence left open would take the footnotes below for code)
	if (fence && typed.length) lines.push(fence);
	typed.forEach((note, i) => lines.push('', `[^${OPEN}${i}]: ${note}`));
	return lines.join('\n');
}

/** A piece of a paragraph as it is read: inline content, or something that ends the paragraph it is in. */
type Piece = Inline | { kind: 'nl' } | { kind: 'embed'; target: string } | { kind: 'image'; src: string; alt: string };
type Mark = Pick<Text, 'i' | 'b' | 's' | 'code' | 'href' | 'to'>;

class Reader {
	held: Held[] = [];
	notes: Block[][] = [];
	warnings = new Set<string>();
	private defs = new Map<string, Node>();
	private links = new Map<string, string>();
	private noteAt = new Map<string, number>();

	read(body: string): Block[] {
		const root = tree(prepare(body, this.held, this.warnings));
		this.collect(root);
		const blocks = this.flow(root.children ?? []);
		// (a footnote typed in place that is never read stood in one that nothing points at: it is that one's to say)
		if ([...this.defs.keys()].some((id) => !this.noteAt.has(id) && !id.startsWith(OPEN))) this.warnings.add('A footnote that nothing in the text points at is left out.');
		return blocks;
	}

	/** Footnotes and link definitions, wherever they are written. */
	private collect(n: Node): void {
		if (n.type === 'footnoteDefinition' && n.identifier && !this.defs.has(n.identifier)) this.defs.set(n.identifier, n);
		if (n.type === 'definition' && n.identifier && !this.links.has(n.identifier)) this.links.set(n.identifier, n.url ?? '');
		for (const c of n.children ?? []) this.collect(c);
	}

	private flow(nodes: Node[]): Block[] {
		const out: Block[] = [];
		for (const n of nodes) {
			switch (n.type) {
				case 'paragraph': out.push(...this.paragraphs(this.inline(n.children ?? [], {}))); break;
				case 'heading': {
					const runs = this.runs(this.inline(n.children ?? [], {}));
					// (a `#` alone on its line is how a manuscript marks a scene break)
					out.push(runs.length ? { kind: 'heading', level: n.depth ?? 1, runs } : { kind: 'break' });
					break;
				}
				case 'thematicBreak': out.push({ kind: 'break' }); break;
				case 'blockquote': out.push(this.quote(n)); break;
				case 'list': out.push({ kind: 'list', ordered: !!n.ordered, start: n.start ?? 1, items: (n.children ?? []).map((item) => this.flow(item.children ?? [])) }); break;
				case 'table': out.push({ kind: 'table', align: n.align ?? [], rows: (n.children ?? []).map((row) => (row.children ?? []).map((cell) => this.runs(this.inline(cell.children ?? [], {})))) }); break;
				case 'code': out.push({ kind: 'code', text: n.value ?? '' }); break;
				case 'html': {
					// (HTML isn't in a book: its text is, a line a paragraph)
					this.warnings.add('HTML is left out; the text inside it is kept.');
					const text = (n.value ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-zA-Z][^>]*>/g, '');
					out.push(...this.paragraphs(this.text(text, {})));
					break;
				}
				default: break; // footnotes and link definitions: read where they are pointed at
			}
		}
		return out;
	}

	/** A quotation. A callout (`> [!note] Title`) is one whose title is set apart; without a title it has none. */
	private quote(n: Node): Block {
		const kids = n.children ?? [], first = kids[0], lead = first?.type === 'paragraph' ? first.children?.[0] : undefined;
		const m = lead?.type === 'text' ? /^\[!([\w-]+)\][+-]?[ \t]*/.exec(lead.value ?? '') : null;
		if (!first || !m) return { kind: 'quote', blocks: this.flow(kids) };
		const pieces = this.inline([{ ...lead, value: (lead.value ?? '').slice(m[0].length) }, ...(first.children ?? []).slice(1)], {});
		const end = pieces.findIndex((p) => p.kind === 'nl'), title = this.runs(end < 0 ? pieces : pieces.slice(0, end));
		const blocks = [...(end < 0 ? [] : this.paragraphs(pieces.slice(end + 1))), ...this.flow(kids.slice(1))];
		return title.length ? { kind: 'quote', title, blocks } : { kind: 'quote', blocks };
	}

	/** Text as pieces: what was held is put back, and each new line ends a paragraph. */
	private text(value: string, mark: Mark): Piece[] {
		const out: Piece[] = [];
		value.split(HELD).forEach((part, i) => {
			if (i % 2) {
				const h = this.held[Number(part)];
				if (!h) return;
				if (h.kind === 'link') out.push({ kind: 'text', text: h.shown, ...mark, to: h.target });
				else if (h.kind === 'embed') out.push({ kind: 'embed', target: h.target });
				else out.push({ kind: 'text', text: h.text, ...mark });
				return;
			}
			part.split('\n').forEach((line, j) => {
				if (j) out.push({ kind: 'nl' });
				if (line) out.push({ kind: 'text', text: line, ...mark });
			});
		});
		return out;
	}

	private inline(nodes: Node[], mark: Mark): Piece[] {
		const out: Piece[] = [];
		for (const n of nodes) {
			switch (n.type) {
				case 'text': out.push(...this.text(n.value ?? '', mark)); break;
				case 'emphasis': out.push(...this.inline(n.children ?? [], { ...mark, i: true })); break;
				case 'strong': out.push(...this.inline(n.children ?? [], { ...mark, b: true })); break;
				case 'delete': out.push(...this.inline(n.children ?? [], { ...mark, s: true })); break;
				case 'inlineCode': if (n.value) out.push({ kind: 'text', text: n.value, ...mark, code: true }); break;
				case 'break': out.push({ kind: 'br' }); break;
				case 'link': case 'linkReference': {
					const url = n.type === 'link' ? n.url ?? '' : this.links.get(n.identifier ?? '') ?? '';
					// (a web address is a link out of the book; anything else names a note)
					out.push(...this.inline(n.children ?? [], /^[a-z][\w+.-]*:/i.test(url) ? { ...mark, href: url } : { ...mark, to: decoded(url) }));
					break;
				}
				case 'image': case 'imageReference': out.push({ kind: 'image', src: n.type === 'image' ? n.url ?? '' : this.links.get(n.identifier ?? '') ?? '', alt: n.alt ?? '' }); break;
				case 'footnoteReference': {
					const id = n.identifier ?? '', def = this.defs.get(id);
					if (!def) break;
					let at = this.noteAt.get(id);
					if (at === undefined) {
						at = this.notes.push([]) - 1;
						this.noteAt.set(id, at);
						this.notes[at] = this.flow(def.children ?? []);
					}
					out.push({ kind: 'note', note: at });
					break;
				}
				case 'html':
					if (/^<br\s*\/?>$/i.test(n.value ?? '')) out.push({ kind: 'br' });
					else this.warnings.add('HTML is left out; the text inside it is kept.');
					break;
				default: if (n.children) out.push(...this.inline(n.children, mark)); break;
			}
		}
		return out;
	}

	/** Pieces as the paragraphs, pictures and embeds they come to. */
	private paragraphs(pieces: Piece[]): Block[] {
		const out: Block[] = [];
		let line: Piece[] = [];
		const end = () => { const runs = this.runs(line); if (runs.length) out.push({ kind: 'p', runs }); line = []; };
		for (const p of pieces) {
			if (p.kind === 'nl') end();
			else if (p.kind === 'embed') { end(); out.push({ kind: 'embed', target: p.target }); }
			else if (p.kind === 'image') { end(); out.push({ kind: 'image', src: p.src, alt: p.alt }); }
			else line.push(p);
		}
		end();
		return out;
	}

	/** Pieces as one stretch of inline content: no white space at its ends, text set the same way run together. What
	    can't stand in a line (a picture in a heading or a table) is left out, and said. */
	private runs(pieces: Piece[]): Inline[] {
		const out: Inline[] = [];
		for (const p of pieces) {
			if (p.kind === 'embed' || p.kind === 'image') { this.warnings.add('A picture or an embed inside a heading or a table is left out.'); continue; }
			if (p.kind === 'nl') { out.push({ kind: 'text', text: ' ' }); continue; }
			const last = out[out.length - 1];
			if (p.kind === 'text' && last?.kind === 'text' && sameMark(last, p)) last.text += p.text;
			else out.push(p.kind === 'text' ? { ...p } : p);
		}
		while (out.length) {
			const f = out[0];
			if (f.kind === 'br') { out.shift(); continue; }
			if (f.kind !== 'text') break;
			f.text = f.text.replace(/^\s+/, '');
			if (f.text) break;
			out.shift();
		}
		while (out.length) {
			const l = out[out.length - 1];
			if (l.kind === 'br') { out.pop(); continue; }
			if (l.kind !== 'text') break;
			l.text = l.text.replace(/\s+$/, '');
			if (l.text) break;
			out.pop();
		}
		return out;
	}
}

const sameMark = (a: Text, b: Text): boolean => !a.i === !b.i && !a.b === !b.b && !a.s === !b.s && !a.code === !b.code && a.href === b.href && a.to === b.to;
const decoded = (url: string): string => { try { return decodeURIComponent(url); } catch { return url; } };

/** A note's text (without its properties: `parts` in scene-text.ts says where they end) as the book model has it. */
export function parseBody(body: string): Parsed {
	const r = new Reader(), blocks = r.read(body);
	return { blocks, notes: r.notes, warnings: [...r.warnings] };
}

/** A whole note, properties and all: they are never exported. */
export const parseNote = (text: string): Parsed => parseBody(parts(text).body);

/** What a note's text embeds and which pictures it shows, as it names them: what must be read before the book is
    put together. */
export function needs(parsed: Parsed): { embeds: string[]; images: string[] } {
	const embeds = new Set<string>(), images = new Set<string>();
	const walk = (blocks: readonly Block[]) => {
		for (const b of blocks) {
			if (b.kind === 'embed') embeds.add(b.target);
			else if (b.kind === 'image') images.add(b.src);
			else if (b.kind === 'quote') walk(b.blocks);
			else if (b.kind === 'list') b.items.forEach(walk);
		}
	};
	walk(parsed.blocks);
	parsed.notes.forEach(walk);
	return { embeds: [...embeds], images: [...images] };
}
