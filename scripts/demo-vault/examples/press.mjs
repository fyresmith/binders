// "The Kitchen Table Press": a handbook. Parts and chapters (folders named "Part …", every note a chapter), a
// preface, front and back matter in folders of those names, headings inside the notes, footnotes of every kind,
// tables, lists, quotations, callouts, drawn figures with captions, and links between chapters and to the web.
import { int } from '../core.mjs';
import { picture } from '../png.mjs';
import { text, writer } from '../prose.mjs';
import { PRESS, PRESS_STOCK } from '../stock/press.mjs';
import { PAPER, THREAD } from './press-1.mjs';
import { BIBLIOGRAPHY, COVERS, GLOSSARY, NOTES } from './press-2.mjs';
import { binder, file, folder, scene } from './shape.mjs';

const INK = [40, 40, 48], SOFT = [150, 150, 160], PAPERC = [250, 247, 240], RED = [190, 60, 50];
/** The four figures, drawn. */
export function figures() {
	const grain = picture(640, 320, PAPERC);
	for (const [x, across] of [[60, false], [360, true]]) {
		grain.frame(x, 40, 220, 240, INK, 3).rect(x, 40, 8, 240, INK);
		for (let i = 1; i < 9; i++) across ? grain.line(x + 20, 40 + i * 26, x + 200, 40 + i * 26, SOFT, 2) : grain.line(x + 10 + i * 23, 60, x + 10 + i * 23, 260, SOFT, 2);
	}
	const fold = picture(660, 300, PAPERC);
	[0, 1, 2].forEach((n) => {
		const x = 30 + n * 215;
		fold.frame(x, 40, 170, 220, INK, 3).line(x + 85, 40, x + 85, 260, RED, 2, 8);
		if (n > 0) fold.line(x, 150, x + 170, 150, RED, 2, 8);
		if (n > 1) fold.line(x + 42, 40, x + 42, 260, RED, 2, 8).line(x + 127, 40, x + 127, 260, RED, 2, 8);
	});
	const stitch = picture(360, 480, PAPERC);
	stitch.frame(40, 30, 280, 420, SOFT, 2).line(180, 30, 180, 450, SOFT, 2, 6);
	for (const y of [80, 240, 400]) stitch.rect(174, y - 6, 14, 14, INK);
	stitch.line(186, 80, 186, 400, RED, 4).line(120, 250, 180, 240, RED, 3).line(240, 250, 182, 240, RED, 3);
	const cas = picture(700, 360, PAPERC);
	cas.rect(30, 30, 640, 300, [215, 205, 190]).frame(30, 30, 640, 300, SOFT, 2).frame(70, 70, 250, 220, INK, 3).frame(380, 70, 250, 220, INK, 3).line(350, 60, 350, 300, RED, 2, 8);
	return { 'grain.png': grain.png(), 'fold.png': fold.png(), 'stitch.png': stitch.png(), 'case.png': cas.png() };
}

// short notes marked by number on generated sentences, so every chapter has its share
const ASIDES = ['Pennyfeather disagrees, at length.', 'The same is said of pastry.', 'See the glossary.', 'This is the only rule in the book without an exception.', 'Or so the author was taught, and has never tested.', 'A dummy made from scrap will show why in a minute.', 'Zhou gives a diagram.', 'Experience, not arithmetic.'];

export function press(add, rand) {
	const w = writer(PRESS_STOCK, PRESS, rand);
	const paras = (n) => text(w.scene({ words: n, breaks: false }));
	const chapter = ([name, synopsis, sections], i, h1) => {
		let n = 0;
		const asides = [];
		// a numbered note on the first sentence of a generated paragraph
		const marked = (s) => (rand() < 0.6 ? s.replace(/\. /, () => { asides.push(ASIDES[int(rand, 0, ASIDES.length - 1)]); return `.[^${++n}] `; }) : s);
		let body = `${h1 ? `# ${h1}\n\n` : ''}${marked(paras(int(rand, 60, 110)))}`;
		for (const [heading, written] of sections) body += `\n## ${heading}\n\n${marked(paras(int(rand, 70, 140)))}\n${written}\n`;
		const labels = [...new Set([...body.matchAll(/\[\^([a-z]+)\]/g)].map((m) => m[1]))];
		body += `\n${asides.map((a, k) => `[^${k + 1}]: ${a}`).concat(labels.map((l) => `[^${l}]: ${NOTES[l]}`)).join('\n')}\n`;
		if (i === 0) body += '[^unused]: A note that nothing in the chapter marks. It should not be in the book.\n';
		return scene(name, { synopsis, status: i < 6 ? 'Done' : 'Revised', label: ['Yellow', 'Orange', 'Cyan'][Math.floor(i / 3) % 3], target: 900 }, body);
	};
	let i = 0;
	const part = (name, synopsis, list, titled = {}) => folder(name, list.map((c) => chapter(c, i++, titled[c[0]])), { synopsis });
	const pics = figures();
	const items = [
		folder('Front matter', [
			scene('Dedication', {}, 'For my mother, who taught me to fold a letter.\n'),
			scene('A note on measurements', {}, 'Measurements are metric, because paper is. An inch is 25.4 mm, and nothing in this book needs to be nearer than a millimetre.\n'),
		]),
		scene('Preface', { synopsis: 'Why make a book by hand at all.', status: 'Done' }, `I made my first book at a kitchen table, with a darning needle and the thread from a sewing box, and it fell apart in a month. This is the book I wanted then.\n\n${paras(90)}\nIt has three parts: paper, thread, and covers. Start at [[Choosing paper]] or, if you are impatient, at [[The pamphlet stitch]].\n`),
		part('Part One - Paper', 'What a book is made of, before anything is sewn.', PAPER, { Folding: 'Folding a sheet' }),
		part('Part Two - Thread', 'Sewing: one signature, then several.', THREAD),
		part('Part Three - Covers', 'Adhesives, hard covers, pressing, and letting the thing go.', COVERS, { 'Numbers and editions': 'Numbers, editions and money' }),
		folder('Back matter', [
			scene('Glossary', {}, GLOSSARY),
			scene('Bibliography', {}, BIBLIOGRAPHY),
			scene('Acknowledgements', {}, 'Thanks to the Tuesday bench at the old library, and to everyone who bought copy number one of anything.\n'),
		]),
		folder('Figures', Object.entries(pics).map(([name, data]) => file(name, data)), { export: false, synopsis: 'The pictures the chapters show. Left out of export as a folder: a picture goes into the book where a chapter embeds it.' }),
	];
	return binder(add, 'The Kitchen Table Press', {
		title: 'The Kitchen Table Press', subtitle: 'A handbook for making small books', author: 'Margit Olawale', language: 'en-GB', target: 9000,
		synopsis: 'How to make a small book by hand, from choosing the paper to selling it at a fair.',
	}, 'A handbook. Chapters are notes, parts are folders, and the front and back matter are in folders of those names.\n', items);
}
