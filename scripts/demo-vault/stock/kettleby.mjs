// The world of "Kettleby Junction": a signal box on a branch line that is to close. Written for this vault.
const lines = (s) => s.trim().split('\n');

export const KETTLEBY = {
	person: 3,
	cast: ['Edmund:he', 'Nell:she', 'Crowe:he', 'Ada:she', 'Lyle:he', 'Hobb:he', 'Winifred:she'],
	places: ['in the signal box', 'on the up platform', 'in the lamp hut', 'at the level crossing', 'in the refreshment room', 'on the footbridge', 'in the goods yard', 'at the water tower', 'in the booking office', 'along the cutting'],
	things: ['the train register', 'the block bell', 'a tin of lamp oil', 'the single-line token', 'the duster', 'the timetable', 'the hand lamp', 'the kettle', 'the detonators', 'a green flag', 'the inspector\'s notebook', 'the lever collar'],
	mix: { own: 1.1, talk: 0.32, breakEvery: 1300 },
	own: {
		sent: lines(`
The 6.12 was four minutes down.
The levers stood in their frame, red, blue, yellow and black.
A bell rang in the box: two beats, a pause, one.
The line ran straight for a mile and then went into the cutting.
The distant signal was a yellow arm against the larch wood.
Steam hung under the footbridge long after the train had gone.
The stove in the box was never allowed to go out.
The register lay open at the day, ruled in red.
Nothing was due for forty minutes.
The rails sang before anything could be seen.
The up platform had not been swept since the porter left.
The crossing gates were white and wanted painting.
The goods yard held three wagons and a great many weeds.
The lamp on the home signal burned a week on one filling.
The junction had been built for a railway that expected more of the country.
The wires hummed in the frost.
The points went over with a sound like a heavy door.
A light engine stood at the water tower, breathing.
The timetable in its frame had been altered by hand.
The refreshment room smelled of tea urn and wet mackintosh.
From the box you could see every train twice, coming and going.
The last down train went through at ten and after that the line belonged to foxes.
Brass shone on the block instruments from thirty years of the same duster.
The clock in the box was set by telegraph at ten each morning.
Fog signals lay in their tin like a box of bad cigars.
The branch had carried milk, then nothing much.
`),
		leads: lines(`
{Name} pulled off the home signal
{Name} wrote the time in the register
{Name} gave the bell code and waited for the answer
{Name} watched the tail lamp out of sight
{Name} wiped the lever handles with the duster
{Name} went down the box steps with {thing}
{Name} stood at the window of the box
{Name} set the road for the branch
{Name} walked the platform to the ramp and back
{Name} climbed the signal ladder to trim the lamp
{Name} held {thing} up to the window
{Name} leaned on the crossing gate
{Name} heard the train in the cutting
{O} came up the box steps two at a time
{O} was standing on the up platform with a suitcase
`),
		pairs: lines(`
Is she on time? | She's never on time. She's regular, which is better.
How long have you had this box? | Thirty-one years in March.
They'll close it, you know. | They'll close the line. The box will just stand here.
What's the code for that? | Three, pause, one. You knew that at six years old.
Was the signal off? | The signal was where the book says it was.
Who signed the register that night? | I did. It's my hand.
You could have a box on the main line. | I could have a great many things.
When's the next one through? | Twenty past, if Hobb's found his fireman.
Did you hear the bell? | I hear it in my sleep.
There's a London train at four. | There's always a London train at four.
`).map((l) => l.split(' | ')),
	},
};
