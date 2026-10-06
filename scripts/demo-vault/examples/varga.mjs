// "The Varga Job": a draft in progress, the messy middle. Mixed statuses (some of the writer's own), empty scenes
// that are only a synopsis, a scene in one paragraph, comments and notes to self in the text, targets missed both
// ways, the same name in different folders, `export-as` where the guess is wrong, cut scenes left out of export,
// a note the list doesn't mention, and snapshots already taken.
import { snapshot } from '../core.mjs';
import { BREAK, mentioned, text, writer } from '../prose.mjs';
import { EN } from '../stock/en.mjs';
import { VARGA } from '../stock/varga.mjs';
import { binder, folder, scene } from './shape.mjs';

// what a writer leaves in a draft: each goes after a paragraph of some scene
const MESS = [
	'%% is this where she sees the second key? check against the floor plan %%',
	'%%\nNOTE TO SELF: the watchman has no name yet. Fifty minutes or forty-five? It is both, in different scenes.\n%%',
	'==TK: the name of the street==',
	'<!-- cut from here to the end of the scene? -->',
	'[something about the weather here]',
	'%%too long%% ==Fix the tram times.==',
];

export function varga(add, rand) {
	const w = writer(EN, VARGA, rand);
	let n = 0, made = 0;
	// a scene: `how` is how many words, 'one' for a single long paragraph, or the text itself
	const s = (name, props, how = 0) => {
		const synopsis = props.synopsis ?? '', others = mentioned(VARGA, synopsis + ' ' + name).filter((x) => x !== 'Lena');
		if (!others.length) others.push(['Marek', 'Dov', 'Ilse'][n % 3]);
		let body = '';
		if (typeof how === 'string' && how !== 'one') body = how;
		else if (how) {
			const paras = w.scene({ pov: 'Lena', others, words: how === 'one' ? 900 : how, breaks: how !== 'one' });
			// (every second scene has something left in it)
			if (how !== 'one' && made++ % 2 === 0) paras.splice(Math.min(2 + (n % 4), paras.length), 0, MESS[(made >> 1) % MESS.length]);
			body = how === 'one' ? paras.filter((p) => p !== BREAK).join(' ').replace(/"/g, '') + '\n' : text(paras);
		}
		n++;
		return scene(name, props, body);
	};
	const items = [
		s('Start here', { export: false, label: 'Yellow' }, '# Where this draft stands\n\n- [x] Act one reads\n- [ ] The plan has a hole in it (on purpose?)\n- [ ] Nothing after the vault is written\n- [ ] Decide whether Ilse is in on it from the start\n\nCut scenes are in their own folder, left out of export. Snapshots were taken before each big cut.\n'),
		s('A note before', { 'export-as': 'front matter', synopsis: 'To the reader of this draft. A note at the top would be a chapter: it is front matter by hand.' }, 'This is a second draft. The first had a tunnel in it.\n'),
		folder('Opening', [
			s('The door', { synopsis: 'The vault door, described by the one person who loves it.', status: 'Revised', label: 'Blue', target: 800 }, 950),
			s('Lena', { synopsis: 'Lena at the laundry, the day before Marek finds her.', status: 'Revised', label: 'Blue', target: 1000 }, 1050),
			s('Notes', { export: false, label: 'Yellow' }, 'Open on the door, not on her. The door is the love interest.\n'),
		], { synopsis: 'The door, and the woman who can open it.', status: 'Revised' }),
		folder('The crew', [
			s('Opening', { synopsis: 'Marek at the Café Orsolya with a sheet of paper.', status: 'Draft', label: 'Green', target: 1200 }, 700),
			s('Lena', { synopsis: 'Marek makes Lena the offer. The same name as a scene in “Opening”.', status: 'Draft', label: 'Green', target: 1500 }, 2300),
			s('Dov', { synopsis: 'Dov and the lorry.', status: 'draft', label: 'Green', target: 800 }, 240),
			s('Ilse', { synopsis: 'Ilse, who works in the records room and has her own reasons.', status: 'Needs research', label: 'Flashback', target: 1000 }, 520),
			s('Teodor', { synopsis: 'The fence. Does he need a scene?', status: 'Idea', label: 'Green' }),
		], { synopsis: 'Four people who should not be in a room together.', status: 'Draft', target: 6000 }),
		folder('The plan', [
			s('One sheet of paper', { synopsis: 'The plan, as Marek tells it.', status: 'Draft', label: 'Purple', target: 1200 }, 1250),
			s('Four locks', { synopsis: 'Lena counts five.', status: 'Draft', label: 'Purple', target: 900 }, 'one'),
			s('The letter Varga never sent', { synopsis: 'Stands alone between two chapters: in a chapter’s folder it would be a scene, so it is a chapter by hand.', status: 'Draft', label: '#7c3aed', 'export-as': 'chapter', target: 500 }, 430),
			s('Rehearsal', { synopsis: 'They walk it through at the laundry, with chalk.', status: 'Idea', label: 'Purple', target: 1500 }),
			s('Notes', { export: false, label: 'Yellow' }, 'Fifty minutes between rounds. Check: could a watchman of sixty do the back stairs in that?\n'),
		], { synopsis: 'It fits on one sheet of paper, and that is what is wrong with it.', status: 'Draft' }),
		folder('The vault, three tries', [
			s('First try', { synopsis: 'From the roof.', status: 'Draft', label: 'Red', target: 800 }, 600),
			s('Second try', { synopsis: 'From the back stairs.', status: 'Draft', label: 'Red', target: 800 }, 380),
			s('Third try', { synopsis: 'Through the front door, at eight, with everyone else.', status: 'Idea', label: 'Red', target: 800 }),
		], { synopsis: 'Three versions of one scene. A folder said to be a scene: it only holds scenes, which go on with the chapter before.', 'export-as': 'scene', status: 'Draft' }),
		folder('The job', [
			s('Opening', { synopsis: 'Four o’clock. The bank closes.', status: 'Draft', label: 'Red', target: 1000 }, 1100),
			s('The vault', { synopsis: 'Fifty minutes, and what Lena hears through the door.', status: 'Draft', label: 'Red', target: 2000 }, 310),
			s('What Ilse did', { status: 'Idea', label: 'Red' }),
			s('Eight o’clock', { synopsis: 'The time lock opens whether anyone likes it or not.', status: 'Idea', label: 'Red', target: 1500 }),
		], { synopsis: 'One night.', status: 'Idea', target: 8000 }),
		s('Coda', { synopsis: 'A page that goes on from the last chapter: a scene by hand, where a note at the top would be a chapter.', status: 'Idea', label: 'Blue', 'export-as': 'scene', target: 300 }, 120),
		s('Thanks', { 'export-as': 'back matter', synopsis: 'Back matter by hand: its name is not one export knows.' }, 'To the locksmith who answered my questions and asked none of his own.\n'),
		folder('Cut scenes', [
			s('The tunnel (cut)', { synopsis: 'The whole tunnel plot, from the first draft.', status: 'Cut', label: 'Pink' }, 800),
			s('Lena’s brother', { synopsis: 'He is gone from the book. This is all that is left of him.', status: 'Cut', label: 'Pink' }, 450),
			s('Opening (old)', { synopsis: 'The first draft’s first page.', status: 'Cut', label: 'Pink' }, 300),
		], { synopsis: 'Kept, and left out of every export.', export: false }),
	];
	const snap = (of, at, words) => add(`Snapshots/${of}/${at}.snapshot`, snapshot(of, at.slice(0, 19), text(w.scene({ pov: 'Lena', others: ['Marek'], words, breaks: false }))));
	snap('Opening/The door', '2026-08-03 07.40.12 First draft', 500);
	snap('Opening/The door', '2026-08-29 22.05.48 Before the rewrite', 900);
	snap('Opening/The door', '2026-09-20 06.58.03', 930);
	snap('The crew/Lena', '2026-09-02 21.14.09 With the brother', 1800);
	snap('The plan/Four locks', '2026-09-27 08.31.55 In paragraphs', 850);
	snap('The job/The tunnel', '2026-08-15 23.50.30 Before cutting the tunnel', 1200);
	add('Scratch.md', 'A new note the list doesn’t mention yet: it shows after the listed ones until it is moved.\n\n%% and it has a comment %%\n');
	return binder(add, 'The Varga Job', { author: 'Dana Whitlock', target: 70000, synopsis: 'A safecracker, a plan that fits on one sheet of paper, and a door that is the love of her life. Second draft, half written.' },
		'%% the binder note’s own text can have comments too %%\nSecond draft. See [[Start here]].\n', items);
}
