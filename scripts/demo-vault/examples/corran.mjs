// "Low Water at Corran": a full-length novel. Three parts of ten chapters, each chapter a folder of scenes; a
// prologue and an epilogue; front and back matter; a point of view, a status, a target and a synopsis on every scene.
import { int } from '../core.mjs';
import { mentioned, text, writer } from '../prose.mjs';
import { EN } from '../stock/en.mjs';
import { CORRAN } from '../stock/corran.mjs';
import { PART_ONE } from './corran-1.mjs';
import { PART_TWO } from './corran-2.mjs';
import { PART_THREE } from './corran-3.mjs';
import { binder, folder, scene, statusAt } from './shape.mjs';
import { BIBLE_LINKS, linkOnce } from './corran-bible.mjs';

export const POV = { I: ['Ines', 'Blue'], T: ['Tobias', 'Green'], K: ['Kit', 'Purple'] };
// who each of them is most often with
const NEAR = { I: ['Agnes', 'Pip', 'Sorrel'], T: ['Sorrel', 'Dunmore', 'Amis'], K: ['Voss', 'Halloran', 'Sorrel'] };
const PARTS = [
	['Part One - Ebb', PART_ONE, 'The tide clock stops, the pilot cutter is lost, and three people come to the same harbour by different roads.'],
	['Part Two - Slack', PART_TWO, 'Nobody tells the whole truth, and the water stands still.'],
	['Part Three - Flood', PART_THREE, 'Everything comes in at once: the wheel, the report, the meeting and the sea.'],
];

/** A part's chapters, read from its text: [name, synopsis, [[scene, pov letter, synopsis], …]]. */
export function chapters(src) {
	const out = [];
	for (const l of src.trim().split('\n')) {
		if (l.startsWith('## ')) { const [name, synopsis] = l.slice(3).split(' :: '); out.push([name, synopsis, []]); }
		else out[out.length - 1][2].push(l.split(' | '));
	}
	return out;
}

// what a writer keeps beside a scene: the `notes` property (the Inspector's)
const NOTES = [
	'Check the state of the tide against chapter one before this goes out.',
	'Too much weather. Cut the second paragraph?',
	'She would not say this aloud. Move it into thought.',
	'Ask a horologist whether a tide train can be cut one tooth out and still run.',
	'The boy is eleven here and twelve in part three. Decide.',
	'Good. Leave alone.',
	'This is the scene the whole part leans on. Slow it down.',
	'Is the dues book red or green? It is both, at present.',
	'Reads cold. One line of what it costs him.',
	'Repeats the lamp business from two chapters back.',
];
// scenes kept beside the book and left out of it
const CUT = {
	'Low water': ['Low water (first version)', 'The same scene from the pierhead, in the present tense. Kept in case.'],
	'The offer': ['The offer (long)', 'The whole dinner conversation, before it was cut to a page.'],
	'A hand\'s breadth': ['High water (from the tower)', 'The tide from where Ines stands. Too close to “By the clock”.'],
};
const OPENINGS = {
	'Low water': 'The clock stopped at eleven minutes past two, at the bottom of the ebb, and Tobias Hale was the only person in Corran awake to hear it.',
	'Over the moor': 'There were four passengers on the last coach over the moor, and only one of them was going all the way to the sea.',
	'Chain and level': 'The letter in her coat gave her thirty days, and the first of them was already half gone.',
};

export function corran(add, rand) {
	const w = writer(EN, CORRAN, rand);
	const total = PARTS.reduce((n, p) => n + chapters(p[1]).reduce((m, c) => m + c[2].length, 0), 0);
	const place = (line) => CORRAN.places.find((p) => line.toLowerCase().includes(p.replace(/^\S+ (the )?/, '').toLowerCase()));
	let at = 0;
	const linked = new Set();
	const write = (name, pov, synopsis, more = {}) => {
		const who = POV[pov][0], others = mentioned(CORRAN, synopsis).filter((n) => n !== who);
		// (a scene whose synopsis names nobody else is mostly not a scene alone)
		if (!others.length && rand() < 0.8) others.push(NEAR[pov][int(rand, 0, 2)]);
		const status = more.status ?? statusAt(at, total, 0.85, rand), target = [900, 1000, 1000, 1200, 1500][int(rand, 0, 4)];
		// a draft runs over or under its target; a finished scene sits near it
		const words = more.words ?? Math.round(target * (status === 'Done' ? 0.92 + rand() * 0.16 : 0.6 + rand() * 0.6));
		let body = text(w.scene({ pov: who, others, words: Math.round(words * 0.92), opening: OPENINGS[name], place: place(synopsis) }));
		if (rand() < 0.45) body = linkOnce(body, BIBLE_LINKS, rand, linked);
		return scene(name, { synopsis, status, label: POV[pov][1], pov: who, target, notes: rand() < 0.2 ? NOTES[int(rand, 0, NOTES.length - 1)] : undefined, ...more.props }, body);
	};
	const parts = PARTS.map(([part, src, about], p) => folder(part, chapters(src).map(([chapter, synopsis, scenes], c) => {
		const items = [];
		for (const [name, pov, syn] of scenes) {
			items.push(write(name, pov, syn));
			at++;
			if (CUT[name]) items.push(write(CUT[name][0], pov, CUT[name][1], { status: 'Draft', props: { export: false } }));
		}
		// (one chapter in three has a target of its own; the rest show their scenes' targets added up)
		return folder(chapter, items, { synopsis, status: p === 0 ? 'Done' : p === 1 ? 'Revised' : 'Draft', target: c % 3 === 0 ? 3500 : undefined });
	}), { synopsis: about, status: ['Done', 'Revised', 'Draft'][p], target: 31000 }, 'Notes on this part: a folder note’s own text, which is no part of the book.\n'));
	const items = [
		scene('Dedication', {}, 'For the keepers of small harbours,\nand for my father, who was never on time.\n'),
		scene('Epigraph', {}, '> The sea keeps no appointments.\n> It is we who are early, or late.\n\n— from the harbour book of Corran, 1871\n'),
		write('Prologue', 'I', 'Thirty years before: the clock is set going, and a child is lifted up to see the moon on its dial.', { status: 'Done', words: 700, props: { label: 'Blue', pov: 'Ines' } }),
		...parts,
		write('Epilogue', 'T', 'A year on: Tobias, a private man now, sets his watch by the tower.', { status: 'Draft', words: 600 }),
		scene('Acknowledgements', {}, 'My thanks to the harbour masters who answered letters, to the clockmaker who let me watch, and to everyone who read this when it was twice as long.\n\nThe mistakes about tides are mine. The sea’s are its own.\n'),
		scene('About the author', {}, 'Esther Harrowgate grew up within sound of a tide bell. *Low Water at Corran* is her first novel.\n'),
	];
	return binder(add, 'Low Water at Corran', {
		title: 'Low Water at Corran', subtitle: 'A novel', author: 'Esther Harrowgate', language: 'en-GB', copyright: '© 2026 Esther Harrowgate',
		target: 100000, synopsis: 'A tide clock stops, a pilot cutter is lost, and a silted harbour is given thirty days to prove it should live.',
	}, 'Blue is Ines, green is Tobias, purple is Kit. The people and places are in [[Corran story bible]], beside this folder.\n', items);
}
