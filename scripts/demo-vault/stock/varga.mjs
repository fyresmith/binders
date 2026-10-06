// The world of "The Varga Job": a bank, a crew and a river city in 1926. A draft, so its own stock is thin.
// Written for this vault.
const lines = (s) => s.trim().split('\n');

export const VARGA = {
	person: 3,
	cast: ['Lena:she', 'Marek:he', 'Dov:he', 'Ilse:she', 'Varga:he', 'Teodor:he'],
	places: ['in the lorry', 'on the loading dock', 'in the vault corridor', 'at the laundry', 'on the bank roof', 'in the back stairs', 'at the Café Orsolya', 'in the records room', 'under the bridge'],
	things: ['the drill', 'the floor plan', 'the stethoscope', 'the carpet bag', 'the watchman\'s keys', 'the stopwatch', 'the dynamo torch', 'a roll of felt', 'the combination'],
	mix: { own: 1.5, talk: 0.36 },
	own: {
		sent: lines(`
The bank closed at four and the vault at half past.
The night watchman made his round every fifty minutes, give or take his knees.
From the roof the river was a strip of tin between the warehouses.
The vault door was Swiss, eleven inches thick, and vain.
The lorry smelled of cabbages, which was the idea.
Trams went by under the windows and made the pens roll.
The plan fitted on one sheet of paper, and that was what was wrong with it.
There were four locks and they had keys to none of them.
The alarm was a bell on a wire, and the wire went somewhere.
The city had been two cities once and still kept two sets of manners.
Rain made the loading dock as slick as a plate.
The time lock would open at eight whether anyone liked it or not.
Somewhere below, a typewriter was still going.
The dust in the back stairs had footprints in it that were not theirs.
`),
		leads: lines(`
{Name} put an ear to the door
{Name} checked the stopwatch against the tram
{Name} went over the floor plan with a pencil
{Name} counted the watchman's steps
{Name} wrapped {thing} in felt
{Name} kept the torch pointed at the floor
{O} was late, which was not in the plan
{O} had brought the wrong bag
`),
		pairs: lines(`
How long do we have? | Fifty minutes. Forty, if his knees are good tonight.
Can you open it? | I can open it. I can't open it *quietly*.
Who drew this? | A man who has never been inside.
What's the split? | Ask me when there's something to split.
Is Varga in the building? | Varga is always in the building.
Where's the driver? | Parked where a driver should be, I hope.
You said four locks. | I said four that we knew of.
`).map((l) => l.split(' | ')),
	},
};
