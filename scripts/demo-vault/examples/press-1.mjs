// "The Kitchen Table Press", parts one and two: what each chapter has that is written and not generated. A chapter
// is [name, synopsis, [[section heading, the written piece that ends it], …]]. The paragraphs between are generated.
export const PAPER = [
	['Choosing paper', 'Weight, finish and size: what to buy for a first book, and what to leave in the shop.', [
		['Weight', `| Weight | Feels like | Good for |
|---:|---|---|
| 80 gsm | Office paper | Dummies, and nothing else |
| 100–120 gsm | A good letter | The pages of most small books |
| 160–200 gsm | A postcard | Covers of pamphlets |
| 300 gsm | Card | Covers that must stand up |

Weights are given in grams per square metre throughout.[^gsm]`],
		['Size', `Everything in this book starts from a sheet of A4 or A3, because that is what the corner shop sells.

| Sheet | Millimetres | Folded once gives |
|---|---|---|
| A3 | 297 × 420 | A4 |
| A4 | 210 × 297 | A5 |
| A5 | 148 × 210 | A6 |

> [!tip] Buy one sheet first
> Take a single sheet home and fold it before buying the ream. See [[Grain]] for what to look for.`],
	]],
	['Grain', 'Paper has a direction. How to find it, and why the spine must run along it.', [
		['Finding it', `![[grain.png]]
*Figure 1. Grain running parallel to the spine (left) and across it (right). The second book will never lie flat.*

There are three tests, in order of how much paper they waste:

1. Bend the sheet gently both ways. It resists less along the grain.
2. Tear a strip each way. The tear along the grain runs straight.
3. Wet one corner. It curls around the grain, like a scroll.^[The third test spoils the sheet, and is the only one nobody argues with.]`],
		['Why it matters', `> A book bound against the grain is a spring wound the wrong way. It will spend its whole life trying to open.
>
> — Aldous Pennyfeather, *The Amateur's Bench* (1911)

The rule is in every manual, and broken in half the books on any shelf.[^pennyfeather] [^gsm]`],
	]],
	['Folding', 'Folio, quarto, octavo: how a sheet becomes pages, and how to fold it square.', [
		['The three folds', `| Name | Folds | Leaves | Pages |
|---|:---:|:---:|:---:|
| Folio | 1 | 2 | 4 |
| Quarto | 2 | 4 | 8 |
| Octavo | 3 | 8 | 16 |

![The same sheet as a folio, a quarto and an octavo](fold.png)
*Figure 2. One sheet, folded once, twice and three times.*`],
		['Folding square', `- Fold on a hard, clean surface.
- Bring corner to corner, not edge to edge.
    - Hold the corners with one hand.
    - Crease from the middle outward with the other.
- Run the bone folder along the crease once, firmly.

A crooked fold cannot be mended, only hidden.[^fold]`],
	]],
];

export const THREAD = [
	['Needle and thread', 'The whole kit: five things, four of them already in the house.', [
		['The kit', `- [x] A needle with an eye big enough to see
- [x] Linen thread, or strong cotton
- [x] A cake of beeswax
- [ ] An awl (a thick needle in a cork will do)
- [ ] A bone folder (the back of a spoon will do, for a while)

Suppliers come and go; a list is kept at <https://example.org/kitchen-table-press/suppliers>.`],
		['Waxing', `Draw the thread across the wax twice. It should feel like a guitar string and not like a candle.[^wax]`],
	]],
	['The pamphlet stitch', 'Three holes, one thread, one knot: the first binding anyone learns.', [
		['Three holes', `![[stitch.png]]
*Figure 3. The path of the thread: in at the middle, out at the top, the long stitch down the back, in at the bottom, out at the middle.*

1. Pierce three holes in the fold: one in the middle, one a thumb's width from each end.
2. Go **in** at the middle from the outside, leaving a tail as long as your hand.
3. Come **out** at the top.
4. Pass down the whole length of the spine and go **in** at the bottom.
5. Come **out** at the middle again, on the other side of the long stitch from the tail.
6. Tie the two ends over the long stitch.

> [!warning]- If the knot slips
> It was tied beside the long stitch and not over it. Cut it out and sew again: there is no repair.`],
		['Five holes', `For a taller book, five holes and the same idea. The chapter [[Longer books]] takes it further.^[Seven holes is not better than five. It is merely more.]`],
	]],
	['Longer books', 'More than one signature: sewing them to each other, and when to stop.', [
		['How many signatures', `| Pages wanted | Sheets in a signature | Signatures |
|---:|---:|---:|
| 32 | 4 | 2 |
| 64 | 4 | 4 |
| 96 | 4 | 6 |
| 160 | 5 | 8 |

Past eight signatures the spine needs help.[^tapes]`],
		['The kettle stitch', `Each signature is tied to the one below it at head and tail, with a small knot that has had many names.[^kettle] The chapter [[Pressing]] says what to do with the swelling.`],
	]],
];
