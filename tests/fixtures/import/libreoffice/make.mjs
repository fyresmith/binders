// The sources of the import's LibreOffice fixtures (tests/import-odt.test.ts, tests/import-rtf.test.ts). Two books
// written by hand as flat OpenDocument files, which LibreOffice itself then saves as every format the tests read, so
// those files are LibreOffice's own writing; and the first book shaped as TextEdit writes rich text (Cocoa's RTF: no
// styles, chapters as larger bold centered lines), which is ours, not TextEdit's (docs/dev/import.md, "Not verified").
//   node tests/fixtures/import/libreoffice/make.mjs && bash tests/fixtures/import/libreoffice/convert.sh
// The oracle for each book is LibreOffice's own .docx of it, read by tests/import-words.ts, which shares no code with
// the readers. (LibreOffice's "save as text" is no oracle here: it prints tracked deletions as text and a footnote's
// number against the word it follows.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const out = new URL('source/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BOOK = [
	{ title: 'The jetty', scenes: [
		['Mara came down to the jetty before the light, as she had every morning since the boats stopped coming. The tide was out and the posts stood up out of the mud like the ribs of something drowned.', 'She counted them, as her father had taught her. *Nineteen.* There had been twenty the week before.', 'Behind her the village was still asleep, its windows dark, its chimneys cold. Only the keeper’s lamp turned on the point, patient as a clock.'],
		['By noon the wind had come round to the east and brought the smell of the salt flats with it. Hal found her mending nets in the lee of the boathouse.', '“They’re saying the road’s gone under at Corran,” he said. “Three days, maybe four.”', 'She didn’t look up. “Then we’ll wait three days.”'],
	] },
	{ title: 'The tide', scenes: [
		['The water rose all afternoon. It came in over the flats in long grey sheets, quiet as breathing, and filled the channels one by one until the jetty stood in open water.', 'Mara watched it from the window of the net loft. She had seen spring tides before, and storm tides, but never one that came in so *smoothly*, as if it had somewhere to be.', 'At six the keeper rang the bell.'],
	] },
	{ title: 'The storm', scenes: [
		['It broke a little after midnight. The first gust took the slates off the chapel roof and sent them skating down the lane like playing cards.', 'Hal was at the door before she had her boots on. “The boat,” he said, and she understood him: the last boat, the one they had kept for the road.', 'They ran.'],
		['In the morning the jetty was gone. Not broken, not leaning: gone, as if the sea had simply taken it back.', 'Mara stood where it had been and counted the posts that were left. There were none to count.'],
	] },
];

// more of the same, so each chapter is the length of one (the dialog doubts chapters under 200 words)
const MORE = [
	'The gulls had gone inland days ago. Nobody in the village said what that meant, though everybody knew it, the way you know the weight of a coat you have worn all winter.',
	'Down at the slip the old men sat on upturned crates and talked about other years: the year the ice came into the harbour, the year the herring failed, the year the lifeboat went out and came back with no one in it.',
	'She walked the length of the sea wall and back again, and then once more, because walking was something to do with her hands and her feet while her head went over the same ground it had been over all morning.',
	'There was bread to bake and a lamp to trim and a letter to answer that she had not answered in a month. She did none of them. She watched the water instead, and the water watched her back.',
];
for (const ch of BOOK) for (const scene of ch.scenes) scene.splice(1, 0, ...MORE.slice(0, 3));

// a PNG of 64 × 40, a small sea-grey picture (kept by import as a file)
function png(w, h) {
	const crc = (buf) => { let c, crcTable = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = crcTable[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
	const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
	const rows = []; for (let y = 0; y < h; y++) { rows.push(0); for (let x = 0; x < w; x++) rows.push(90 + y, 110 + y, 120 + (x >> 1)); }
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// ---- OpenDocument, flat ----
const span = (t) => esc(t).replace(/\*([^*]+)\*/g, '<text:span text:style-name="Emphasis">$1</text:span>');
let body = '<text:p text:style-name="Title">The Salt Road</text:p><text:p text:style-name="Subtitle">A novel</text:p>';
BOOK.forEach((ch, c) => {
	body += `<text:h text:style-name="Heading_20_1" text:outline-level="1">${esc(ch.title)}</text:h>`;
	ch.scenes.forEach((scene, s) => {
		if (s) body += '<text:p text:style-name="Scene_20_break">* * *</text:p>';
		scene.forEach((p, i) => {
			let t = span(p);
			if (c === 0 && s === 0 && i === 0) t = t.replace('every morning', 'every morning<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p text:style-name="Footnote">Corran had had no ferry since 1931.</text:p></text:note-body></text:note>');
			if (c === 0 && s === 1 && i === 0) t = t.replace('mending nets', '<office:annotation office:name="c1"><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date><text:p>Is she alone here? Check against chapter 3.</text:p></office:annotation>mending nets<office:annotation-end office:name="c1"/>');
			if (p.includes('spring tides')) t = t.replace('spring tides before', 'spring tides <text:change-start text:change-id="ct1"/>many times <text:change-end text:change-id="ct1"/>before').replace('as if it had', '<text:change text:change-id="ct2"/>as if it had');
			if (p.startsWith('At six')) t += '</text:p><text:p text:style-name="Text_20_body"><draw:frame draw:name="Tide chart" text:anchor-type="as-char" svg:width="1.6cm" svg:height="1cm"><draw:image><office:binary-data>' + png(64, 40).toString('base64') + '</office:binary-data></draw:image></draw:frame>';
			body += `<text:p text:style-name="Text_20_body">${t}</text:p>`;
		});
	});
});
const tracked = '<text:tracked-changes><text:changed-region text:id="ct1"><text:insertion><office:change-info><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date></office:change-info></text:insertion></text:changed-region><text:changed-region text:id="ct2"><text:deletion><office:change-info><dc:creator>Ann</dc:creator><dc:date>2026-10-01T10:00:00</dc:date></office:change-info><text:p text:style-name="Text_20_body">and so fast, </text:p></text:deletion></text:changed-region></text:tracked-changes>';
const fodt = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:styles>
<style:default-style style:family="paragraph"><style:text-properties fo:font-size="12pt"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-indent="0.5cm" fo:margin-bottom="0.2cm"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body"><style:text-properties fo:font-size="14pt"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="1"><style:paragraph-properties fo:break-before="page"/><style:text-properties fo:font-size="130%" fo:font-weight="bold"/></style:style>
<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="28pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Heading"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="Scene_20_break" style:display-name="Scene break" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="10pt"/></style:style>
<style:style style:name="Emphasis" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
</office:styles>
<office:body><office:text>${tracked}${body}</office:text></office:body></office:document>`;
writeFileSync(out + 'salt-road.fodt', fodt);

// ---- TextEdit's rich text ----
const rtfText = (t) => t.replace(/\\/g, '\\\\').replace(/[{}]/g, (c) => '\\' + c).replace(/’/g, "\\'92").replace(/“/g, "\\'93").replace(/”/g, "\\'94").replace(/\*([^*]+)\*/g, '\n\\f1\\i $1\n\\f0\\i0 ');
const NUM = ['One', 'Two', 'Three'];
let rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2822
\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;\\f1\\fswiss\\fcharset0 Helvetica-Oblique;\\f2\\fswiss\\fcharset0 Helvetica-Bold;
}
{\\colortbl;\\red255\\green255\\blue255;}
{\\*\\expandedcolortbl;;}
\\paperw11900\\paperh16840\\margl1440\\margr1440\\vieww11520\\viewh8400\\viewkind0
\\pard\\tx566\\tx1133\\tx1700\\tx2267\\tx2834\\tx3401\\tx3968\\tx4535\\tx5102\\tx5669\\tx6236\\tx6803\\pardirnatural\\qc\\partightenfactor0

\\f2\\b\\fs48 \\cf0 The Salt Road\\
\\pard\\tx566\\tx1133\\tx1700\\tx2267\\tx2834\\tx3401\\tx3968\\tx4535\\tx5102\\tx5669\\tx6236\\tx6803\\pardirnatural\\partightenfactor0

\\f0\\b0\\fs24 \\cf0 \\
`;
BOOK.forEach((ch, c) => {
	rtf += `\\pard\\tx566\\pardirnatural\\qc\\partightenfactor0

\\f2\\b\\fs36 \\cf0 Chapter ${NUM[c]}\\
\\pard\\tx566\\pardirnatural\\partightenfactor0

\\f0\\b0\\fs24 \\cf0 \\
`;
	ch.scenes.forEach((scene, s) => {
		if (s) rtf += `\\pard\\tx566\\pardirnatural\\qc\\partightenfactor0
\\cf0 *\\
\\pard\\tx566\\pardirnatural\\partightenfactor0
\\cf0 \\
`;
		scene.forEach((p) => { rtf += `\\cf0 \t${rtfText(p)}\\\n`; });
		rtf += '\\\n';
	});
});
rtf += '}';
writeFileSync(out + 'salt-road-textedit.rtf', rtf);

// ---- the second book: what a LibreOffice manuscript holds beside its words ----
// Headings numbered by the outline ("Chapter 1", written by LibreOffice, not typed), a heading with no words of its
// own, a bulleted and a numbered list, a table, hidden text (LibreOffice's Hidden effect) and a paragraph of it, a section, a bold word, an
// underlined one, a link, and a page break by a paragraph's own style.
const P = (t, style = 'Text_20_body') => `<text:p text:style-name="${style}">${t}</text:p>`;
const long = (seed) => Array.from({ length: 60 }, (_, i) => ['salt', 'wind', 'rope', 'tide', 'stone', 'gull', 'lamp', 'boat'][(i * 7 + seed) % 8]).join(' ') + '.';
const numbered = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:styles>
<style:style style:name="Standard" style:family="paragraph"/>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"/>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="1"><style:paragraph-properties fo:break-before="page"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Strong" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Hidden" style:family="text"><style:text-properties text:display="none"/></style:style>
<style:style style:name="Under" style:family="text"><style:text-properties style:text-underline-style="solid"/></style:style>
<text:outline-style style:name="Outline"><text:outline-level-style text:level="1" style:num-prefix="Chapter " style:num-format="1"/></text:outline-style>
<text:list-style style:name="Bullets"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style>
<text:list-style style:name="Numbers"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/></text:list-style>
</office:styles>
<office:body><office:text>
<text:h text:style-name="Heading_20_1" text:outline-level="1">The harbour</text:h>
${P(`It was <text:span text:style-name="Strong">cold</text:span> on the <text:span text:style-name="Under">quay</text:span>, and the <text:a xlink:type="simple" xlink:href="https://example.org/tides">tide tables</text:a> were wrong. ${long(1)}`)}
${P('<text:span text:style-name="Hidden">A note to self. </text:span>She packed:')}
<text:list text:style-name="Bullets"><text:list-item>${P('rope')}</text:list-item><text:list-item>${P('a lamp')}</text:list-item></text:list>
<text:list text:style-name="Numbers"><text:list-item>${P('first the boat')}</text:list-item><text:list-item>${P('then the road')}</text:list-item></text:list>
<text:section text:name="Letter">${P(long(2))}</text:section>
<text:h text:style-name="Heading_20_1" text:outline-level="1"/>
${P(long(3))}
<table:table table:name="Tides"><table:table-column table:number-columns-repeated="2"/><table:table-row><table:table-cell>${P('High')}</table:table-cell><table:table-cell>${P('06:12')}</table:table-cell></table:table-row></table:table>
${P('<text:span text:style-name="Hidden">Never shown.</text:span>')}
${P(long(4))}
<text:h text:style-name="Heading_20_1" text:outline-level="1">The road</text:h>
${P(long(5))}
${P(long(6))}
</office:text></office:body></office:document>`;
writeFileSync(out + 'numbered.fodt', numbered);
console.log('made');
