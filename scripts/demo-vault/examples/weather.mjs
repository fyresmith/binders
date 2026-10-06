// "Nine Kinds of Weather": a collection of short stories, each with a shape of its own: a single note, a folder of
// scenes, a note with numbered sections, a page of flash fiction, a folder with a folder inside it, a story in
// fragments, one that is nearly all talk, one with an epigraph and a footnote, and one that is only an idea.
import { BREAK, text, writer } from '../prose.mjs';
import { EN } from '../stock/en.mjs';
import { binder, folder, scene } from './shape.mjs';

// each story has its own few people and places; the sentences are the shared ones
const world = (cast, places, things, more = {}) => ({ person: 3, cast, places, things, ...more });
const FOG = world(['Marta:she', 'Oskar:he'], ['on the ferry', 'at the landing', 'in the ticket hut'], ['the fog horn', 'the ferry rope', 'a thermos', 'the cash tin']);
const THAW = world(['Leena:she', 'Ilya:he', 'Babka:she'], ['on the river ice', 'in the fish hut', 'at the bridge'], ['the auger', 'the sledge', 'a string of perch', 'the stove pipe'], { person: 1, narrator: 'Leena' });
const DRY = world(['Amos:he', 'Ruth:she', 'Dell:he'], ['at the stock tank', 'in the feed store', 'on the county road'], ['the rain gauge', 'the well cover', 'a sack of seed', 'the truck keys']);
const HEAT = world(['Cass:she', 'Benoît:he', 'Yusuf:he'], ['on the fire escape', 'in the stairwell', 'at the corner shop', 'on the roof'], ['the fan', 'a bag of ice', 'the radio', 'the spare key'], { quotes: 'curly' });
const FROST = world(['Hanne:she'], ['in the greenhouse', 'at the allotment gate'], ['the thermometer', 'a tray of seedlings', 'the paraffin heater']);
const WIND = world(['Gil:he', 'Noor:she'], ['on the headland', 'in the car'], ['the kite', 'the map', 'a flask']);
const HAIL = world(['Tamsin:she', 'Rook:he'], ['in the orchard', 'under the cart shed'], ['the ladder', 'a basket of plums', 'the tarpaulin']);

export function weather(add, rand) {
	const tell = (w, opts, how) => text(writer(EN, w, rand).scene(opts), how);
	// a story in fragments: a few sentences, a break, a few more
	const fragments = () => { const w = writer(EN, { ...FROST, mix: { short: 0.2, thought: 0.15 } }, rand), out = []; for (let i = 0; i < 9; i++) { if (i) out.push(BREAK); out.push(...w.scene({ pov: 'Hanne', words: 70, breaks: false })); } return text(out); };
	// a note with numbered sections, each under a heading
	const sections = () => { const w = writer(EN, DRY, rand); return [1, 2, 3, 4, 5].map((n) => `## ${n}\n\n${text(w.scene({ pov: n % 2 ? 'Amos' : 'Ruth', others: [n % 2 ? 'Ruth' : 'Amos', 'Dell'], words: 380, breaks: false }))}`).join('\n'); };
	const items = [
		scene('Dedication', {}, 'For everyone who has ever said it looks like rain.\n'),
		scene('Fog', { synopsis: 'The ferryman’s wife runs the last crossing herself, by ear.', status: 'Done', label: 'Blue', target: 1800 }, `# Fog, or the ferryman’s wife\n\n${tell(FOG, { pov: 'Marta', others: ['Oskar'], words: 1800, opening: 'On the morning the fog came down Oskar was in bed with his back, and the ferry went anyway.' })}`),
		folder('Thaw', [
			scene('The ice sings', { synopsis: 'Leena hears the river ice begin to go, a week early.', status: 'Done', target: 900 }, tell(THAW, { others: ['Ilya'], words: 900 })),
			scene('Babka’s hut', { synopsis: 'Babka will not leave the fish hut, and Ilya will not leave Babka.', status: 'Revised', target: 1200 }, tell(THAW, { others: ['Babka', 'Ilya'], words: 1150 })),
			scene('Open water', { synopsis: 'The hut goes down the river with the stove still lit.', status: 'Draft', target: 800 }, tell(THAW, { others: ['Babka'], words: 600 })),
		], { synopsis: 'Three scenes on a river in the last week of the ice. Told by Leena.', label: 'Cyan', status: 'Revised' }),
		scene('Dry spell', { synopsis: 'Five numbered sections: a drought, a rain gauge, and two neighbours who stop speaking.', status: 'Revised', label: 'Yellow', target: 2000 }, sections()),
		scene('Squall', { synopsis: 'Flash fiction: one paragraph, one gust, one hat.', status: 'Done', label: 'Purple', target: 200 }, 'The squall came across the bay the way bad news comes across a room: you see everyone else get it first. The awnings went, and then the gulls, and then a hat, a good grey one, which rose off its owner as if it had somewhere better to be and went up the high street at the height of the first-floor windows. Nobody ran after it. That was the thing she remembered afterwards, more than the rain, which was ordinary, or the cold, which she had dressed for: forty people on the seafront, and every one of them watching a stranger’s hat leave town, and not one moving, as though the hat had been deputed to go on behalf of all of them. Its owner put his hand to his head and kept it there. Then the rain arrived and the street remembered itself, and people ran for doorways, and she never did find out whose it was.\n'),
		folder('Heat', [
			scene('Day nine', { synopsis: 'The ninth day over ninety. Cass moves her bed to the fire escape.', status: 'Done', target: 1000 }, tell(HEAT, { pov: 'Cass', others: ['Benoît'], words: 1000 }, { mark: '---' })),
			folder('Night', [
				scene('The roof', { synopsis: 'The whole building is on the roof by midnight.', status: 'Draft', target: 900 }, tell(HEAT, { pov: 'Cass', others: ['Yusuf', 'Benoît'], words: 800 })),
				scene('Ice', { synopsis: 'Yusuf opens the shop at two in the morning and sells ice at cost.', status: 'Draft', target: 700 }, tell(HEAT, { pov: 'Cass', others: ['Yusuf'], words: 450 })),
			], { synopsis: 'A folder inside a story’s folder: deeper than “chapters and scenes” reaches, so it only groups.' }),
			scene('Day ten', { synopsis: 'It breaks.', status: 'Idea', target: 600 }, ''),
		], { synopsis: 'A heat wave in one building, with a folder inside the folder.', label: 'Red', status: 'Draft' }),
		scene('Frost', { synopsis: 'Nine fragments from one night in a greenhouse.', status: 'Revised', label: 'Blue', target: 700 }, fragments()),
		scene('Wind', { synopsis: 'Two people, a kite and an argument, nearly all in talk.', status: 'Draft', label: 'Green', target: 900 }, text(writer(EN, { ...WIND, mix: { talk: 0.85, short: 0.02, thought: 0.02 } }, rand).scene({ pov: 'Gil', others: ['Noor'], words: 900, breaks: false }))),
		scene('Hail', { synopsis: 'A plum orchard, ten minutes of hail, and what it costs. Has an epigraph and a footnote.', status: 'Done', label: 'Orange', target: 1200 }, `> Count the plums on the tree, not the plums in the basket.\n>\n> — orchard saying\n\n${tell(HAIL, { pov: 'Tamsin', others: ['Rook'], words: 1100 }).replace(/\.\n\n/, '.[^plums]\n\n')}\n[^plums]: A plum bruised by hail keeps a week at most. Growers called them *weather fruit* and sold them from the gate.\n`),
		scene('Still air', { synopsis: 'A day with no weather at all. Not written yet: only this card.', status: 'Idea', label: 'Pink', target: 1500 }, ''),
		scene('Acknowledgements', {}, '“Fog” first appeared in *The Landing Stage*, and “Squall” in *Small Hours Quarterly*. Thanks to both.\n'),
	];
	return binder(add, 'Nine Kinds of Weather', {
		title: 'Nine Kinds of Weather', subtitle: 'Stories', author: 'Imogen Achterberg', language: 'en-GB', structure: 'chapters and scenes', target: 14000,
		synopsis: 'Nine short stories, each named for the weather in it.',
	}, 'Each story is a note, or a folder of scenes. `structure` is set by hand here: “Heat” has a folder inside it, and the guess would have made the stories into parts.\n', items);
}
