import { inlines, type Block, type Inline, type Picture, type Text } from '../model';
import { NOTE_CLOSE, NOTE_OPEN, TABBED } from './text';

/* A note's blocks as the RTF Scrivener keeps a document in. Plain RTF 1 that both of Scrivener's readers (Cocoa's on
   the Mac, its own on Windows) take: `\par` between paragraphs, two fonts both systems have, ASCII only (everything
   else as `\uN?`), nothing a platform owns. Footnotes and comments are Scrivener's own inline markers, written as
   text, as its Tutorial has them. What rich text has no match for stays as it is typed. Pure. */

export interface RtfContext {
	/** The note's footnotes: a mark is its place here. */
	notes: readonly Block[][];
	/** The id of the document a link to a note leads to, when that note is in the project. */
	link(to: string): string | null;
	/** A picture the note shows or embeds, by the name it uses; null when it isn't one that can be set. */
	picture(src: string): Picture | null;
	/** Told of what stayed as Markdown, in a few words ("A table"). */
	kept(what: string): void;
}

/** Text for RTF: its three special characters escaped, everything outside ASCII as `\uN?` (UTF-16 units, signed: an
    emoji is two of them), a comment's ends as the ends of an annotation. */
export function esc(s: string): string {
	let o = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i], c = s.charCodeAt(i);
		if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch;
		else if (ch === '\t') o += '\\tab ';
		else if (ch === NOTE_OPEN) o += ANNOTATION;
		else if (ch === NOTE_CLOSE) o += '\\\\end_Scrv_annot\\}';
		else if (ch === TABBED || c < 32 || c === 127) continue;
		else if (c < 128) o += ch;
		else o += `\\u${c > 32767 ? c - 65536 : c}?`;
	}
	return o;
}
/** Scrivener's inline annotation, in the red its own Tutorial uses (Mac 3.5.2): the markers are literal text. */
const ANNOTATION = '\\{\\\\Scrv_annot \\\\color=\\{\\\\R=0.619608\\\\G=0.043137\\\\B=0.011765\\} \\\\text=';

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
/** A picture in the text, as hex: 15 twips to the pixel (96 to the inch), no wider than a page's text. */
function pict(p: Picture): string | null {
	if (p.type === 'gif') return null; // (RTF has no GIF)
	const scale = Math.min(1, 6000 / Math.max(1, p.width * 15));
	let hex = '';
	for (let i = 0; i < p.data.length; i++) hex += HEX[p.data[i]] + (i % 64 === 63 ? '\n' : '');
	return `{\\pict\\${p.type === 'png' ? 'pngblip' : 'jpegblip'}\\picw${p.width}\\pich${p.height}\\picwgoal${Math.round(p.width * 15 * scale)}\\pichgoal${Math.round(p.height * 15 * scale)}\n${hex}}`;
}

/** A web address inside a field: ASCII, and nothing that ends the field early. */
const address = (url: string): string => { let u = url; try { u = encodeURI(decodeURI(url)); } catch { /* as it is */ } return u.replace(/[\\{}"]/g, (c) => `%${c.charCodeAt(0).toString(16)}`).replace(/[^\x21-\x7e]/g, ''); };

/** A note's text as one RTF file, or null when it has none. */
export function rtf(blocks: readonly Block[], ctx: RtfContext): string | null {
	const written = new Set<number>();

	const text = (r: Text): string => {
		const marks = `${r.i ? '\\i' : ''}${r.b ? '\\b' : ''}${r.s ? '\\strike' : ''}${r.code ? '\\f1' : ''}`;
		const body = marks ? `{${marks} ${esc(r.text)}}` : esc(r.text);
		if (r.href) return `{\\field{\\*\\fldinst{HYPERLINK "${address(r.href)}"}}{\\fldrslt ${body}}}`;
		const id = r.to ? ctx.link(r.to) : null;
		return id ? `{\\field{\\*\\fldinst{HYPERLINK "scrivlnk://${id}"}}{\\fldrslt ${body}}}` : body;
	};
	/** A footnote where its mark is, as Scrivener's inline footnote: its paragraphs run together, a footnote inside it
	    in its place. One marked twice is written once: no word is there twice. */
	const footnote = (n: number): string => {
		const note = ctx.notes[n];
		if (!note || written.has(n)) return '';
		written.add(n);
		const parts: string[] = [];
		const walk = (list: readonly Block[]) => {
			for (const b of list) {
				if (b.kind === 'code') parts.push(esc(b.text.replace(/\s+/g, ' ')));
				else if (b.kind === 'p' || b.kind === 'heading') parts.push(inline(b.runs));
				else for (const runs of inlines([b])) parts.push(inline(runs));
			}
		};
		walk(note);
		const said = parts.filter((p) => p).join(' ');
		return said ? `\\{\\\\Scrv_fn=${said}\\\\end_Scrv_fn\\}` : '';
	};
	const inline = (runs: readonly Inline[]): string => runs.map((r) => (r.kind === 'text' ? text(r) : r.kind === 'br' ? '\\line ' : footnote(r.note))).join('');

	const out: string[] = [];
	const para = (format: string, body: string) => { out.push(`\\pard${format} ${body}`); };
	const edge = (li: number, ri: number) => `${li ? `\\li${li}` : ''}${ri ? `\\ri${ri}` : ''}`;
	const mono = (line: string, li: number, ri: number) => para(edge(li, ri), `{\\f1\\fs20 ${line}}`);
	const typed = (what: string, said: string, li: number, ri: number) => { ctx.kept(what); para(`${edge(li, ri)}\\sa200`, esc(said)); };
	const picture = (pic: Picture | null, said: string, li: number, ri: number) => {
		const p = pic ? pict(pic) : null;
		if (p) para(`${edge(li, ri)}\\sa200`, p); else typed('A picture that couldn’t be put in the text', said, li, ri);
	};

	const flow = (list: readonly Block[], li: number, ri: number, lead?: { format: string; mark: string }): void => {
		list.forEach((b, i) => {
			const first = lead && i === 0 ? lead : null;
			switch (b.kind) {
				case 'p': {
					const one = b.runs[0], tabbed = !first && one?.kind === 'text' && one.text.startsWith(TABBED);
					if (first) para(first.format, first.mark + inline(b.runs));
					else para(`${edge(li, ri)}${tabbed ? '\\fi360' : '\\sa200'}`, inline(b.runs));
					break;
				}
				case 'heading': para(`${edge(li, ri)}\\sb240\\sa120`, `{\\b\\fs${[36, 30, 26][b.level - 1] ?? 24} ${inline(b.runs)}}`); break;
				case 'break': para(`${edge(li, ri)}\\qc\\sa200`, '* * *'); break;
				case 'quote':
					if (b.title) para(`${edge(li + 720, ri + 720)}\\sa200`, `{\\b ${inline(b.title)}}`);
					flow(b.blocks, li + 720, ri + 720);
					break;
				case 'list':
					b.items.forEach((item, n) => {
						const at = li + 720, mark = b.ordered ? `${b.start + n}.\\tab ` : '\\u8226?\\tab ';
						const format = `\\li${at}${ri ? `\\ri${ri}` : ''}\\fi-360\\tx${at}`;
						if (item[0]?.kind === 'p') flow(item, at, ri, { format, mark }); else { para(format, mark); flow(item, at, ri); }
					});
					break;
				case 'table': {
					// (a table has no match that both of Scrivener's readers take: it stays as it is typed)
					ctx.kept('A table');
					b.rows.forEach((row, n) => {
						mono(`| ${row.map((cell) => inline(cell)).join(' | ')} |`, li, ri);
						if (n === 0) mono(`|${row.map(() => '---').join('|')}|`, li, ri); // (the rule as a Markdown table is typed, so it reads back as one)
					});
					break;
				}
				case 'code': for (const line of b.text.split('\n')) mono(esc(line), li + 360, ri); break;
				case 'image': picture(b.picture ?? ctx.picture(b.src), `![${b.alt}](${b.src})`, li, ri); break;
				case 'embed': {
					const name = b.target.split('|')[0].trim(), pic = ctx.picture(name), id = pic ? null : ctx.link(name);
					if (pic) picture(pic, `![[${b.target}]]`, li, ri);
					// (a note set inside another has no match: it stays as typed, and leads to the document if it is one)
					else { ctx.kept('A note or file embedded in another'); para(`${edge(li, ri)}\\sa200`, id ? `{\\field{\\*\\fldinst{HYPERLINK "scrivlnk://${id}"}}{\\fldrslt ${esc(`![[${b.target}]]`)}}}` : esc(`![[${b.target}]]`)); }
					break;
				}
			}
		});
	};
	flow(blocks, 0, 0);
	if (!out.length) return null;
	return '{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\n'
		+ '{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fmodern\\fcharset0 Courier New;}}\n'
		+ '{\\colortbl;\\red0\\green0\\blue0;}\n'
		+ '\\f0\\fs24\n' + out.join('\\par\n') + '}';
}

