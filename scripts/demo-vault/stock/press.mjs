// The stock of "The Kitchen Table Press", a handbook: sentences that explain, with nobody in them. Its own stock
// and not the shared one (a handbook has no dialogue). Written for this vault.
const lines = (s) => s.trim().split('\n');

export const PRESS_STOCK = {
	sent: lines(`
A book is a stack of folded sheets that has been persuaded to stay together.
Paper has a grain, as wood does, and it matters for the same reason.
The fold is the oldest machine in the trade.
Nothing in this chapter needs a tool you cannot find in a kitchen drawer.
A sheet folded once is a folio; folded twice, a quarto; three times, an octavo.
Thread holds a book together, and glue only keeps the thread company.
Most mistakes are made before the needle is threaded.
A small book forgives nearly everything except haste.
The press does more work than the binder, and does it overnight.
Thin paper folds well and shows through; thick paper does the opposite.
Waxed thread tangles less and bites into the fold.
An awl makes the hole and the needle only follows it.
Paste is slow and can be undone; glue is fast and cannot.
The first copy is always the worst, which is why it is called a dummy.
A sharp blade is safer than a blunt one.
Cloth hides a multitude of sins at the hinge.
Every measurement in a book is taken from the spine.
Damp is the enemy until the moment it is the method.
The cover is a promise and the first page keeps or breaks it.
An edition of fifty is a week's evenings.
Paper remembers every crease it is given.
Readers handle a book for an hour and a shelf holds it for a century.
The margin is where the thumb goes.
Two signatures are harder than one and no harder than twenty.
A bone folder costs less than a ruined ream.
The knot goes inside, where nobody will see it and everybody will feel it.
`),
	leads: lines(`
Most beginners fold against the grain
The sheet should be squared before it is creased
A pamphlet of sixteen pages needs four sheets
It is worth making one copy badly on purpose
The holes are pierced from the inside of the fold
Good paper costs more than good thread
The thread should be three times the height of the spine
A weight on the stack does half the work
Covers are cut a little larger than the pages
The needle goes in at the middle hole
Paste is brushed from the centre outward
Each signature is pressed before the next is sewn
The boards are cut with the grain running head to tail
One spoiled sheet in ten is ordinary
The spine is rounded with the heel of the hand
Old books teach more than new manuals
The last signature is sewn like the first, in reverse
A rule and a knife will do the work of a guillotine
The cloth is cut with a margin all round
It pays to count the pages twice
`),
	tails: lines(`
, and the book never quite lies flat afterwards.
, which is easier shown than described.
, though no two binders agree on how much.
, and the difference shows within a year.
, as the old manuals all insist.
, and nothing later will put it right.
, or the pages will fan at the fore-edge.
, which is the whole secret of the thing.
, and patience does the rest.
, at least for a book that will be read more than once.
, a rule with fewer exceptions than most.
, and the reader will never know why it feels right.
, so long as the paper is dry.
, which takes a morning to learn and a year to do well.
, and it is cheaper to learn this on scrap.
, whatever the cost of the paper.
, before anything is glued.
, and the work should be left alone until it is dry.
`),
	turns: lines(`
In practice
As a rule
More often than not
For a first book
With thin paper
On a kitchen table
Strictly speaking,
Done properly,
`),
};

export const PRESS = { person: 3, cast: ['one:they'], places: ['on the bench', 'in the press', 'at the table'], things: ['the bone folder', 'the awl', 'the needle', 'the knife', 'the rule', 'the paste brush'], mix: { talk: 0, short: 0, thought: 0, long: 0.2, lead: 0.6, tail: 0.6 } };
