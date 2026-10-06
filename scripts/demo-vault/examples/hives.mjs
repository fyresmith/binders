// "Twelve Hives": a novella. Chapters only, one level: twelve folders named for their numbers ("One" … "Twelve",
// so a chapter has a number and no title), two or three scenes in each. First person, typed with curly quotes, scene
// breaks typed "* * *".
import { int } from '../core.mjs';
import { mentioned, text, writer } from '../prose.mjs';
import { EN } from '../stock/en.mjs';
import { HIVES } from '../stock/hives.mjs';
import { chapters } from './corran.mjs';
import { binder, folder, scene, statusAt } from './shape.mjs';

// ## chapter :: its synopsis, then scene | synopsis
const BOOK = `
## One :: January. Wren comes up the hill road to a house that is hers and bees that are not yet.
The key under the skep | Wren finds the key where the letter said, and the kitchen as her aunt left it.
Twelve lids | She counts twelve hives in the snow and cannot tell which are alive.
Pask at the wall | Pask comes to look at the hives and will not come nearer than the wall.
## Two :: February. The notebook, and the first hive lost.
The notebook | Her aunt's notebook: a line a day for thirty years, and nothing for the last month.
Hefting | Pask shows her how to heft a hive. Number nine weighs nothing.
## Three :: March. The first flying day, and Jonah's letter.
The first warm day | Every hive is out by noon, and Wren is stung for the first time.
Jonah writes | Jonah writes that the house should be sold, and that he has found a buyer.
Odile's ladder | Odile lends a ladder and an opinion of Jonah.
## Four :: April. Blossom, frost, and a man with a measuring tape.
Blossom | The orchard flowers all in one week.
Lowell | Lowell walks the long field with a measuring tape and a pleasant manner.
Frost | A late frost takes the blossom, and Wren feeds the hives sugar by lamplight.
## Five :: May. The swarm.
The plum tree | A swarm hangs in the plum tree, and Wren has read about this only once.
Taking it | Pask talks her through taking the swarm from the far side of the wall.
Hive thirteen | She houses the swarm in a box and paints a number on it herself.
## Six :: June. Mirren's schoolchildren, and what the village says.
The schoolchildren | Mirren brings the school to see the bees. One child is not afraid.
Telling the bees | Odile explains what telling the bees is, and what Wren's aunt told them.
## Seven :: July. The lime flow.
The lime flow | The limes flower, and the scales under hive two go up a pound a day.
Jonah comes | Jonah comes in person, with Lowell's offer in his pocket.
The supper | Supper for three, at which the house is discussed as though Wren were not in it.
## Eight :: August. Taking the honey.
The extractor | Wren and Odile take the honey off: two days, forty pounds a hive.
What it fetches | Lowell offers to buy the whole crop, which is not what he wants to buy.
Pask comes in | Pask comes through the gate at last, to show her the failing queen in hive five.
## Nine :: September. The heather, and why Pask stopped.
Up to the heather | They carry four hives to the moor on a borrowed cart.
Why he stopped | Pask tells her why he has kept no bees for eleven years.
## Ten :: October. Wasps, robbers, and an answer for Jonah.
Robbing | Wasps and robber bees: Wren narrows the entrances and loses one hive anyway.
An answer | She writes to Jonah. It takes four drafts to get it down to one line.
The jar on the step | A jar on the doorstep every week, and at last she sees who leaves it.
## Eleven :: November. Shutting down.
Mouse guards | The hives are shut down for winter, each in the order her aunt's notebook gives.
Lowell again | Lowell comes once more, and is shown the hives, and understands.
## Twelve :: December. A year of lines in the notebook.
The first snow | Snow on the lids again. Eleven of the thirteen are humming.
A line a day | Wren writes the last line of the year under her aunt's last line.
`;
const CHAPTERS = chapters(BOOK.replace(/^(?!## )(.*?) \| /gm, '$1 | W | '));

export function hives(add, rand) {
	const w = writer(EN, HIVES, rand);
	const total = CHAPTERS.reduce((n, c) => n + c[2].length, 0);
	let at = 0;
	const items = CHAPTERS.map(([name, synopsis, scenes]) => folder(name, scenes.map(([title, , syn]) => {
		const others = mentioned(HIVES, syn);
		if (!others.length && rand() < 0.6) others.push(['Odile', 'Pask', 'Mirren'][int(rand, 0, 2)]);
		const status = statusAt(at++, total, 1.05, rand), target = [800, 1000, 1200][int(rand, 0, 2)];
		const body = text(w.scene({ others, words: Math.round(target * (0.85 + rand() * 0.3)), opening: OPENINGS[title] }), { mark: '* * *' });
		return scene(title, { synopsis: syn, status, target }, body);
	}), { synopsis, label: SEASON[Math.floor((CHAPTERS.findIndex((c) => c[0] === name) + 1) / 3) % 4] }));
	return binder(add, 'Twelve Hives', {
		title: 'Twelve Hives', author: 'Nora Callaway', language: 'en-US', target: 30000,
		synopsis: 'A year, month by month, with a dead aunt’s bees and the village that came with them.',
	}, 'One chapter a month. The chapter folders are labeled by season: blue for winter, green for spring, yellow for summer, orange for autumn.\n', items);
}
const SEASON = ['Blue', 'Green', 'Yellow', 'Orange'];
const OPENINGS = {
	'The key under the skep': 'The letter said the key would be under the old straw skep by the door, and it was, along with a dead wasp and a year of dust.',
	'The plum tree': 'I heard it before I saw it: a sound like a kettle that has been boiling in another room for some time.',
};
