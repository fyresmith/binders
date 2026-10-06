// The world of "Twelve Hives": a hill village, a dead aunt's bees, and a year told by the woman who inherits them, in
// the first person. Written for this vault.
const lines = (s) => s.trim().split('\n');

export const HIVES = {
	person: 1, narrator: 'Wren', quotes: 'curly',
	cast: ['Wren:she', 'Odile:she', 'Pask:he', 'Jonah:he', 'Mirren:she', 'Lowell:he'],
	places: ['in the apiary', 'in the honey house', 'at the top of the orchard', 'in the kitchen', 'on the hill road', 'at the chapel gate', 'in the long field', 'at the well', 'in the loft', 'by the lime trees'],
	things: ['the smoker', 'the hive tool', 'a frame of capped honey', 'the veil', 'my aunt’s notebook', 'the skep', 'a jar of last year’s honey', 'the queen cage', 'the extractor', 'a comb', 'the scales', 'the feeder'],
	mix: { own: 1.2, talk: 0.26, thought: 0.03, breakEvery: 1100 },
	own: {
		sent: lines(`
The hives stood in a row under the lime trees, white and patient.
The bees were flying low, which meant rain.
There was a hum in the orchard that you stopped hearing after a week.
The heather was late that year.
Smoke hung over the apiary in the still air.
Wax had got into everything, even the bread.
The hill road was all ruts and foxgloves.
Hive seven had always been bad-tempered.
The lime flow came in the second week of July.
A swarm hung in the plum tree like a dark fruit.
The honey house smelled of wax and old sacking.
Frost had got the early blossom.
The bees had not flown for nine days.
Every hive had a number painted on its lid in my aunt's hand.
Drones lay on the landing boards, turned out for the winter.
The village went to bed early and knew everything by morning.
The clover was over.
There were wasps at the entrance of hive three.
The orchard had not been pruned since my aunt took ill.
The extractor sang as it turned.
Ivy was in flower on the chapel wall and loud with bees.
The snow lay on the hive roofs like a second lid.
Propolis stuck my fingers together.
The scales under hive two had not moved in a fortnight.
Somebody had left a jar on the doorstep, and a note with no name.
The long field had been cut and the bees had moved up the hill.
The queen in hive five was failing.
It was the first warm day and every hive was out.
`),
		leads: lines(`
{Name} lit the smoker with a twist of sacking
{Name} lifted the lid of hive four
{Name} put my ear to the side of the hive
{Name} counted the hives, as if one might have gone
{Name} went up through the orchard with {thing}
{Name} read a page of my aunt's notebook
{Name} hefted the hive to feel its weight
{Name} scraped the wax from {thing}
{Name} watched the entrance for a quarter of an hour
{Name} got stung on the wrist
{Name} carried {thing} down to the honey house
{Name} walked the row at dusk
{Name} found {O} leaning on the orchard gate
{O} would not come nearer than the wall
{O} knew more about bees than {oshe} let on
`),
		pairs: lines(`
Do they know you yet? | They know I'm not her.
Will you keep them? | Ask me after the winter.
How many did you lose? | Two. Three, if seven doesn't come through.
She always said to tell them the news. | I've told them. They weren't surprised.
Are you selling? | Who's asking, you or him?
Does it hurt? | Every time. You stop minding before it stops hurting.
You're doing it wrong. | Show me, then.
What's it worth, a hive? | More than you'd pay.
Is that the queen? | No. You'll know her when you see her.
You could go back to town. | I could.
`).map((l) => l.split(' | ')),
	},
};
