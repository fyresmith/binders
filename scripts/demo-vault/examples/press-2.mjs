// "The Kitchen Table Press", part three, its footnotes and its back matter (see press-1.mjs for the form).
export const COVERS = [
	['Paste and glue', 'Two adhesives, and which mistakes each one lets you take back.', [
		['Which to use', `| | Wheat paste | PVA glue |
|:---|:---:|:---:|
| Dries in | Hours | Minutes |
| Can be undone | Yes, with water | No |
| Keeps | Three days | A year |
| Costs | Almost nothing | A little |

> [!note] Making paste
> One part flour to five of cold water. Stir, heat gently until it turns from white to grey, and cool under a wet cloth.[^paste]`],
		['Putting it on', `Brush from the centre to the edges and past them, onto scrap. A dry edge is the only mistake that shows.`],
	]],
	['Boards and cloth', 'A hard cover from grey board and a tea towel.', [
		['Cutting', `![[case.png]]
*Figure 4. The case laid out flat: two boards, the gap for the spine, and the cloth turned in all round.*

The gap between the boards is the thickness of the book plus two thicknesses of board. Measure it on the book, not on paper.[^case]`],
		['Covering', `Cloth stretches when it is wet with paste, and shrinks as it dries. Lay it down, turn the edges in, and nip the corners.^[A nipped corner is pinched between finger and thumbnail while the paste is wet. There is a longer way, with a knife, described in every manual and used by nobody.]`],
	]],
	['Pressing', 'Weight, boards and a night: what the press does, and what to use instead of one.', [
		['Instead of a press', `Two bread boards and the heaviest books in the house. Put waxed paper between the boards and the work, or the work will become part of the boards.

> Leave it. Go to bed. The book is doing more than you could.
>
> > The reader in a hurry should take up another trade.
>
> — both from Pennyfeather, who was not a patient man[^pennyfeather]`],
		['How long', `Overnight for paste; an hour for glue; a week, if the boards have warped, with the damp side up.[^warp]`],
	]],
	['Numbers and editions', 'How many to make, what to write in the back, and what to charge.', [
		['An edition', `Number each copy in pencil on the last page, *7/50*, and sign it if you can stand to. A colophon says what the book is made of and when.

| Copies | Evenings | Worth it? |
|---:|---:|---|
| 1 | 1 | Always |
| 10 | 3 | Usually |
| 50 | 12 | Ask someone first |
| 200 | — | Find a printer |`],
		['A table at a fair', `Take change, a cloth for the table and half as many copies as you think.[^fair] Listings of small-press fairs are kept by [the Fellowship of Pamphleteers](https://example.com/fairs), and at <https://example.org/kitchen-table-press/fairs>.`],
	]],
];

// every footnote the chapters mark, by its label: a plain one, a long one in two paragraphs, one with a link
export const NOTES = {
	gsm: 'Grams per square metre. A ream of 80 gsm A4 weighs about two and a half kilograms.',
	pennyfeather: 'Pennyfeather, *The Amateur’s Bench*, 2nd ed. (Thrupp & Lyle, 1911), 14–19.',
	fold: 'It can be hidden by trimming, at the cost of a millimetre from every page that was folded straight.',
	wax: 'Marchetti, *Thread: a short history* (Calder Row Press, 1987), 52.',
	tapes: 'Tapes, or cords, sewn across the spine. They are outside the scope of a kitchen table, and of this book.\n    The curious should begin with Okonkwo, *Sewing on Supports* (1974), which is thorough to a fault,\n    and then find someone to show them.',
	kettle: 'Kettle stitch, catch stitch, ketel steek: see the [glossary](https://example.org/kitchen-table-press/glossary#kettle).',
	paste: 'Rice flour makes a whiter paste, and cornflour a weaker one. Marchetti gives eleven recipes, of which nine are this one.',
	case: 'Halloran-Reyes, “The Quarter-Inch Problem,” *Journal of the Bench* 12 (1996): 3–9.',
	warp: 'A board warps toward the side that was pasted. Paste a waste sheet on the other side and it will pull back.',
	fair: 'The author’s own experience, three years running.',
};

export const BIBLIOGRAPHY = `Every source here is cited in the notes.

- Halloran-Reyes, D. “The Quarter-Inch Problem.” *Journal of the Bench* 12 (1996): 3–9.
- Marchetti, Livia. *Thread: A Short History*. Calder Row Press, 1987.
- Okonkwo, Benedict. *Sewing on Supports*. Fenner & Daughters, 1974.
- Pennyfeather, Aldous. *The Amateur’s Bench*. 2nd ed. Thrupp & Lyle, 1911.
- ———. *Paste, and Other Disappointments*. Thrupp & Lyle, 1919.
- Sørensen, Åse. *Papir*. Translated by M. Achterberg. Lindgate, 2003.
- Zhou Wenli. *The Folded Sheet*. Lindgate, 2011.

Online, as of this writing: <https://example.org/kitchen-table-press/sources>.
`;

export const GLOSSARY = `**Fore-edge.** The edge of a book opposite the spine.

**Grain.** The direction most of the fibres in a sheet lie. See [[Grain]].

**Gsm.** Grams per square metre: the weight of paper.

**Kettle stitch.** The small knot that ties one signature to the next. See [[Longer books]].

**Signature.** A group of sheets folded together and sewn through the fold.
`;
