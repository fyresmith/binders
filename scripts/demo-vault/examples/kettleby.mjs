// "Kettleby Junction": a novel that is one flat list of notes, every note a chapter ("01 The up distant"), typed
// the way a novelist types or Scrivener exports: every paragraph begins with a tab, one line after another.
import { mentioned, text, writer } from '../prose.mjs';
import { EN } from '../stock/en.mjs';
import { KETTLEBY } from '../stock/kettleby.mjs';
import { linkOnce } from './corran-bible.mjs';
import { binder, scene, statusAt } from './shape.mjs';

// chapter | whose it is (E Edmund, N Nell) | synopsis
const BOOK = `
The up distant | E | Edmund opens the box at five, as he has for thirty-one years, and finds a notice on the door.
The notice | E | The branch is to close in the spring. Edmund reads it standing up and enters the 6.12.
Nell's bicycle | N | Nell rides to the junction with her father's dinner and a letter she has not shown him.
Mr Crowe | E | Crowe, the inspector, arrives to audit the box before it closes, and is very civil.
The register | E | Crowe asks for the train registers, all of them, back to the war.
The refreshment room | N | Ada gives Nell tea and tells her what a London train costs.
Bell codes | E | Edmund teaches Crowe the codes of the branch, which are not quite those in the book.
Lyle | E | Lyle, the porter who left, is seen on the up platform and will not come up to the box.
A page in a different ink | E | Crowe finds a night in the register written in a different ink.
The letter | N | The letter offers Nell a place at a telegraph school, starting in February.
Fog | E | Fog all day: Edmund works the line by bell and by ear, and Crowe watches him do it.
Detonators | E | Hobb brings the down goods through on fog signals and stops to say what the men are saying.
Winifred | N | Winifred, the stationmaster's wife, tells Nell about the night nobody mentions.
The night in question | E | Eleven years ago: a signal off that should have been on, and an excursion train in the cutting.
What Lyle did | E | Lyle changed the points by hand that night, and Edmund wrote the register so that nobody did anything.
Tea with the inspector | E | Crowe takes tea in the box and asks nothing, which is worse.
Ada's arithmetic | N | Ada works out what the refreshment room is worth without the railway, on the back of a menu.
The single line | E | The token is lost for an hour, and the whole branch stands still.
Nell tells him | N | Nell tells her father about the telegraph school, and he asks what the fare is.
The cutting | E | Edmund walks the cutting on his day off, to the place where the excursion stopped.
Lyle comes up | E | Lyle comes up the box steps at last, for the first time in eleven years.
Two accounts | E | Lyle remembers the night one way and the register has it another.
Crowe's notebook | E | Crowe leaves his notebook in the box overnight, open, perhaps on purpose.
Snow | N | Snow closes the road, and the only way to anywhere is the train.
The milk train | E | The last milk train: three churns and a wreath somebody has hung on the smokebox.
What the book wants | E | Crowe explains what the book wants: a name, and it need not be the right one.
Winifred's evidence | N | Winifred offers to say what she saw, if anyone will ask her.
The lever | E | Edmund shows Nell the lever, number fourteen, and tells her all of it.
February | N | Nell's place at the school is held until the end of the month, and no longer.
The report | E | Crowe writes his report in the refreshment room, and Ada reads it upside down.
A fair copy | E | Edmund writes the night out again in the register as it happened, and signs it.
Hobb's whistle | E | Hobb whistles through the junction every day now, long, as if for a funeral.
The fare | N | Edmund puts the fare on the kitchen table and goes out to the garden.
The last day | E | The last day of the branch: every train entered, every bell answered.
The 4.10 | N | Nell takes the London train, and her father pulls off the signals for it himself.
Box closed | E | Edmund writes “Box closed” in the register, banks the stove out of habit, and locks the door.
`.trim().split('\n').map((l) => l.split(' | '));

const WHO = { E: ['Edmund', 'Green'], N: ['Nell', 'Orange'] };
const p2 = (n) => String(n).padStart(2, '0');
// what the chapters link to: notes kept in the binder and left out of the book
const LINKS = { Nell: 'People on the line#Nell', Crowe: 'People on the line#Mr Crowe', Lyle: 'People on the line#Lyle', Ada: 'People on the line#Ada', Hobb: 'People on the line#Hobb', 'the signal box': 'The junction, drawn', 'the cutting': 'The junction, drawn' };

export function kettleby(add, rand) {
	const w = writer(EN, KETTLEBY, rand);
	const items = BOOK.map(([title, who, synopsis], i) => {
		const name = `${p2(i + 1)} ${title}`, others = mentioned(KETTLEBY, synopsis).filter((n) => n !== WHO[who][0]);
		if (!others.length && rand() < 0.7) others.push(who === 'E' ? ['Crowe', 'Nell', 'Hobb'][i % 3] : ['Ada', 'Edmund', 'Winifred'][i % 3]);
		const target = 1500, paras = w.scene({ pov: WHO[who][0], others, words: Math.round(target * (0.9 + rand() * 0.2)), opening: i === 0 ? OPENING : undefined });
		let body = text(paras, { tabs: true });
		// links, on lines that begin with a tab: one or two to the notes at the end, and now and then one to the web
		body = linkOnce(body, LINKS, rand);
		if (i % 6 === 4) body = body.replace(/\n/, ' It was all in [the working timetable](https://example.com/kettleby/timetable), for anyone who cared to look.\n');
		return scene(name, { synopsis, status: statusAt(i, BOOK.length, 1.2, rand), label: WHO[who][1], target }, body);
	});
	const people = '## Edmund\n\nSignalman at Kettleby Junction for thirty-one years.\n\n## Nell\n\nHis daughter, nineteen. Wants the telegraph school.\n\n## Mr Crowe\n\nThe inspector. Civil, and thorough.\n\n## Lyle\n\nPorter until eleven years ago.\n\n## Ada\n\nKeeps the refreshment room.\n\n## Hobb\n\nDriver of the down goods.\n';
	items.push(scene('People on the line', { export: false, label: 'Yellow' }, people), scene('The junction, drawn', { export: false, label: 'Yellow' }, '```\n   up distant      home        box        starter\n ----o--------------o---------[##]----------o-------->  to London\n                         \\\n                          \\______ branch ______  to Kettleby Magna\n```\n'));
	return binder(add, 'Kettleby Junction', {
		title: 'Kettleby Junction', author: 'R. A. Fenwick', language: 'en-GB', target: 55000,
		synopsis: 'A signalman, the branch line that is to close, and the one night in his register that is not as it happened.',
	}, 'Typed with a tab at the start of every paragraph. The last two notes are not part of the book.\n', items);
}
const OPENING = 'The box was cold at five in the morning in every month of the year, and Edmund Rask had long ago stopped holding it against the box.';
