// The world of "Low Water at Corran": a silted harbour town, its tide clock, and the people who answer for both.
// Written for this vault.
const lines = (s) => s.trim().split('\n');

export const CORRAN = {
	person: 3,
	cast: ['Ines:she', 'Tobias:he', 'Kit:she', 'Agnes:she', 'Sorrel:she', 'Dunmore:he', 'Voss:she', 'Halloran:he', 'Amis:he', 'Pip:he'],
	places: ['on the quay', 'in the customs house', 'at the weighbridge', 'in the lamp room', 'on the bar', 'at the Anchor', 'in the sail loft', 'in the workshop', 'on the tower stairs', 'in the lower town', 'at the cannery wharf', 'in the harbour office'],
	things: ['the dues book', 'the almanac', 'the brass wheel', 'the lead line', 'the tide tables', 'the chart', 'a coil of tarred rope', 'the lamp', 'the winding key', 'the telegram', 'the level', 'a stub of chalk', 'the pattern book', 'the storm glass'],
	mix: { own: 1 },
	own: {
		sent: lines(`
The tide was a long way out and the harbour lay open like a hand.
From the tower the channel showed as a darker thread in the mud.
The clock had four faces and only one of them told the hour.
Low water left the boats leaning on their legs along the quay.
The bar showed white where the sea broke on it.
Every house in the lower town had a line on its wall where some tide had stood.
The dredger sat in the channel like a thing that had given up.
The weighbridge had weighed nothing since the herring went.
Mud ticked and sucked under the piles of the wharf.
The customs house had been built for a bigger town.
The tide bell hung in its frame at the end of the quay, green with weather.
At slack water the whole harbour held still, as if listening.
The smell of the cannery came and went with the wind.
Nobody in Corran owned a watch that agreed with the tower.
The lamp at the pierhead burned oil the harbour had not paid for.
Out past the bar the sea was the color of slate.
The tide tables were pinned by the office door, a year to a sheet.
Gulls walked the mud with the look of men inspecting a ruin.
The flood came in over the flats faster than a man could walk.
On the tide dial the brass moon stood where it had stopped.
The ferry steps went down into nothing at this state of the tide.
Somebody had chalked the times of high water on the harbour wall and somebody else had corrected them.
The ebb had left a line of weed along the slip.
A lugger lay over on her side in the mud.
The harbour light was lit an hour early.
The nets were out to dry along the rails.
The mud flats shone like pewter.
The wind was off the sea and tasted of it.
A buoy clanked somewhere out in the fog.
The slip was green to the high-water mark.
The cannery whistle went for the end of the shift.
The fish quay had been swept and still smelled of fish.
The channel markers leaned every way but upright.
The water in the harbour was the color of strong tea.
The pilot flag had not been flown that week.
A rowing boat was working out toward the bar.
The tide was making.
The tower threw its shadow the length of the quay.
The weather glass in the office was falling.
The capstan had not turned in a year.
Rain was coming in over the bar.
The chains of the weighbridge had rusted orange.
The herring gulls had the mud to themselves.
The harbour office kept its lamp burning all night.
The dial facing the sea had lost its gilt.
The slates of the lower town were wet and blue.
`),
		leads: lines(`
{Name} went down the ferry steps as far as the weed
{Name} looked up at the tide dial
{Name} walked out along the quay to the bell
{Name} checked the time against the tower from habit
{Name} could smell the mud before {she} could see it
{Name} watched the water find its way back up the channel
{Name} ran a thumb along the teeth of {thing}
{Name} climbed until the town was all roofs
{Name} counted the boats that had not gone out
{Name} stood at the office window with {thing}
{Name} read the soundings off again
{Name} put {thing} in the drawer with the charts
{Name} went up to wind the clock that was not going
{Name} walked the tide line with {her} eyes down
{Name} took the reading at the pole
{Name} chalked a figure on the wall
{Name} waited for the water to turn
{Name} stood under the dial until {her} neck ached
{Name} entered the day in the harbour log
{Name} trimmed the pierhead lamp
{Name} looked out toward the bar
{Name} pulled the boat up above the weed
{Name} found {O} at the end of the quay
{O} was looking at the water, not at {him}
{O} had mud to the knee
`),
		pairs: lines(`
What does the clock say? | It says what it said yesterday.
When is high water? | That depends on whom you ask.
Is there depth in the channel? | There's depth in the tables.
You've been up the tower. | Somebody had to go.
The Board will want numbers. | The Board can have numbers. It's the truth that's short.
Who winds it now? | The boy. When he remembers.
It was my father's work. | I know whose work it was.
How far out is the bar? | Nearer every year.
Did you sound it yourself? | Twice. I didn't believe the first.
They'll close the harbour. | They'll close the book on it. The harbour will sit here regardless.
Was she inside the bar or outside it? | Ask me at slack water.
The tables are printed. | So is the Bible, and people still drown.
`).map((l) => l.split(' | ')),
		thoughts: lines(`
An hour. A whole hour out.
The water doesn't read the tables.
Ninety-one steps, and no better answer at the top.
Whose hand moved it?
`),
	},
};
