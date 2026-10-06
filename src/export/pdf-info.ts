/* What a PDF says about itself. Chromium writes a PDF's title and nothing of its author; a book has one. So the
   file is given a new information dictionary (title, author, what made it) the way the format itself provides for:
   an incremental update appended to the file, which changes nothing that was printed. And its pages are counted,
   so that export can be sure the printer made as many as were laid out. Pure: bytes in, bytes out. */

const latin = (data: Uint8Array): string => { let s = ''; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000)); return s; };

/** How many pages a PDF has; -1 when it can't be told. */
export function pdfPages(data: Uint8Array): number {
	const text = latin(data), counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g), ...text.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((m) => Number(m[1]));
	if (counts.length) return Math.max(...counts);
	const pages = text.match(/\/Type\s*\/Page\b(?!s)/g);
	return pages ? pages.length : -1;
}

/** A string as a PDF holds any text: UTF-16, in hex. */
const hex = (s: string): string => { let out = 'FEFF'; for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0'); return `<${out}>`; };
const stamp = (d: Date): string => `(D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)`;

export interface PdfInfo { title: string; author: string; creator: string; when?: Date }

/** A PDF with its title, author and maker said. A file that isn't built the way Chromium builds one (no plain
    trailer to add to) is handed back as it is: its text is all there, it only says less about itself. */
export function withInfo(data: Uint8Array, info: PdfInfo): Uint8Array {
	const text = latin(data), at = text.lastIndexOf('startxref');
	const prev = at < 0 ? null : /startxref\s+(\d+)/.exec(text.slice(at));
	const trailerAt = text.lastIndexOf('trailer');
	if (!prev || trailerAt < 0) return data;
	const trailer = text.slice(trailerAt, at), size = /\/Size\s+(\d+)/.exec(trailer), root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer);
	if (!size || !root) return data;
	const ids = /\/ID\s*\[[^\]]*\]/.exec(trailer);
	const id = Number(size[1]), when = info.when ?? new Date();
	const fields = [`/Title ${hex(info.title)}`, info.author ? `/Author ${hex(info.author)}` : '', `/Creator ${hex(info.creator)}`, '/Producer (Chromium)', `/CreationDate ${stamp(when)}`, `/ModDate ${stamp(when)}`].filter((f) => f).join(' ');
	const lead = text.endsWith('\n') ? '' : '\n', object = `${lead}${id} 0 obj\n<< ${fields} >>\nendobj\n`;
	const objectAt = data.length + lead.length, xrefAt = data.length + object.length;
	const tail = `xref\n0 1\n0000000000 65535 f \n${id} 1\n${String(objectAt).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${id + 1} /Root ${root[1]} /Info ${id} 0 R${ids ? ` ${ids[0]}` : ''} /Prev ${prev[1]} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
	const added = object + tail, out = new Uint8Array(data.length + added.length);
	out.set(data);
	for (let i = 0; i < added.length; i++) out[data.length + i] = added.charCodeAt(i);
	return out;
}
