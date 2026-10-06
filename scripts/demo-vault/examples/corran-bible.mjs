// The story bible of "Low Water at Corran": people, places and a timeline, in a folder beside the book and not a
// binder. The novel's scenes link here, so backlinks (and whatever says where someone appears) have something real.
import { note } from '../core.mjs';

// who and what the scenes link to: the word in the text → the note
export const BIBLE_LINKS = {
	Ines: 'Ines Marrow', Tobias: 'Tobias Hale', Kit: 'Kit Adeyemi', Agnes: 'Agnes Marrow', Sorrel: 'Sorrel Hale', Dunmore: 'Old Dunmore',
	Voss: 'Marguerite Voss', Halloran: 'Captain Halloran', Amis: 'Father Amis', Pip: 'Pip Carne',
	'the customs house': 'The customs house', 'the Anchor': 'The Anchor', 'the lower town': 'The lower town', 'the quay': 'Corran quay',
};

/** A text with one or two of its names made links to their notes, at the first place each stands. Never inside
    another link, and nothing else changes. */
export function linkOnce(body, links, rand, seen = new Set()) {
	const found = Object.keys(links).filter((k) => new RegExp(`\\b${k}\\b(?!'s)`).test(body));
	let out = body;
	for (let n = Math.min(found.length, rand() < 0.5 ? 1 : 2); n > 0; n--) {
		// (`seen`: what a book has linked so far, so that each note gets a link before any gets a tenth)
		const fresh = found.filter((k) => !seen.has(k)), from = fresh.length ? fresh : found;
		const k = from[Math.floor(rand() * from.length)];
		found.splice(found.indexOf(k), 1);
		seen.add(k);
		out = out.replace(new RegExp(`\\b${k}\\b(?!'s)(?![^[\\]]*\\]\\])`), `[[${links[k]}|${k}]]`);
	}
	return out;
}

const PEOPLE = [
	['Ines Marrow', 'Clockmaker’s apprentice', 27, 'Came home to mend her father’s clock and found out what he had done to it. Trained in the city under a master she still writes to. Counts things when she is frightened.', 'Over the moor'],
	['Tobias Hale', 'Harbour master', 58, 'Harbour master for nineteen years, and his father before him. Has known for six that the tables are wrong. Father of [[Sorrel Hale]].', 'Low water'],
	['Kit Adeyemi', 'Surveyor to the Harbour Board', 34, 'Sent to say whether the harbour is worth dredging. Good at numbers, bad at dinners. Was meant to find against the town.', 'Chain and level'],
	['Agnes Marrow', 'Ines’s aunt', 66, 'Kept house for her brother until he died, and has kept his secret since. Feeds people instead of answering them.', 'Agnes at the door'],
	['Sorrel Hale', 'The harbour master’s daughter', 16, 'Keeps the pierhead lamp and, from the lamp room, has drawn the only true chart of the harbour.', 'Sorrel’s arithmetic'],
	['Old Dunmore', 'Pilot', 71, 'The last pilot who can take a ship over the bar by eye. Saw the cutter go, and knows where she lies.', 'The cutter’s lamp'],
	['Marguerite Voss', 'Owner of the cannery', 49, 'Wants the harbour closed and the railway at her door. Built her wharf over water that should not be deep.', 'A room at the Anchor'],
	['Captain Halloran', 'Master of the dredger', 52, 'Paid by the Board to dredge the channel and by [[Marguerite Voss]] to dredge somewhere else.', 'Halloran’s price'],
	['Father Amis', 'Priest', 63, 'Keeps the parish book, in which every drowning has the state of the tide beside it.', 'Amis afterwards'],
	['Pip Carne', 'Winds the clock', 11, 'Eleven, or twelve. Has been setting the tide hand by guesswork and is usually right.', 'Pip'],
];
const PLACES = [
	['The customs house', 'Built for a bigger town. The tide clock is in its tower, ninety-one steps up; the harbour office is on the ground floor.'],
	['The tide clock', 'Four faces: three tell the hour and the fourth, toward the sea, the state of the tide, with a brass moon. Built by Ines’s father thirty years ago, in [[The customs house]].'],
	['The Anchor', 'The inn on [[Corran quay]]. [[Marguerite Voss]] owns the freehold, and eats there as though she did not.'],
	['The lower town', 'The streets behind the quay, a yard above the highest spring tide, or so the tables say. Every house has a line on its wall.'],
	['Corran quay', 'From the weighbridge to the tide bell. Dry at low water, when the boats lean on their legs.'],
	['The bar at Corran', 'The sandbar across the harbour mouth. Nearer every year.'],
];

/** The bible's files. */
export function bible(add) {
	const scene = (s) => s.replace(/’/g, '\'');
	for (const [name, role, age, about, first] of PEOPLE) add(`People/${name}.md`, note({ role, age, tags: ['character'] }, `${about}\n\nFirst seen in [[${scene(first)}]].\n`));
	for (const [name, about] of PLACES) add(`Places/${name}.md`, note({ tags: ['place'] }, `${about}\n`));
	add('Corran timeline.md', note({ tags: ['timeline'] }, '| When | What |\n|---|---|\n| Thirty years before | The tide clock is set going (the prologue) |\n| Six years before | Ines’s father dies. The almanac and the printed tables part company |\n| Day 1 | The clock stops at low water. The pilot cutter is lost ([[Low water]]) |\n| Day 3 | [[Ines Marrow]] comes home; [[Kit Adeyemi]] arrives with thirty days |\n| Day 29 | The spring tide comes an hour early ([[An hour early]]) |\n| Day 44 | The Board gives fourteen days more |\n| The equinox | High water, by the clock ([[A hand\'s breadth]]) |\n'));
	add('Corran story bible.md', `Everything about [[Low Water at Corran]] that is not the book: nothing here is in the binder, and nothing here is exported.\n\n## People\n\n${PEOPLE.map(([n, role]) => `- [[${n}]], ${role[0].toLowerCase()}${role.slice(1)}`).join('\n')}\n\n## Places\n\n${PLACES.map(([n]) => `- [[${n}]]`).join('\n')}\n\n## When\n\n- [[Corran timeline]]\n`);
}
