// "The Cartographer's Winter": a Longform project that is a real book. An index note with Longform's own
// properties, fourteen scenes directly in its folder (two of them indented under another, as Longform nests), a
// file Longform ignores, a scene the list doesn't mention, and a snapshot where Binders keeps a project's.
import { note, snapshot } from '../core.mjs';
import { mentioned, text, writer } from '../prose.mjs';
import { EN } from '../stock/en.mjs';

const WORLD = {
	person: 3,
	cast: ['Signe:she', 'Halvard:he', 'Brandt:he', 'Tove:she'],
	places: ['in the survey hut', 'on the col', 'at the trig point', 'in the drawing room', 'on the glacier tongue', 'at the post house', 'in the mule shed'],
	things: ['the theodolite', 'the plane table', 'a roll of tracing linen', 'the field book', 'the barometer', 'the chain', 'a tin of India ink', 'the unfinished sheet'],
	mix: { own: 1.5, breakEvery: 1200 },
	own: {
		sent: `The pass had closed behind them in the second week of October.
The map stopped at the edge of the table, and so, that winter, did the world.
Snow had filled the survey marks to the top.
The hut had been built for two men and a mule and held three people and no mule.
On a clear day the far peak stood so near it seemed a mistake.
The contour lines on the sheet were brown, and finer than hair.
The stove ate a mule-load of wood a week.
Nothing on the north face had a name yet.
The barometer had been falling since noon.
Light came through the oiled paper of the window the color of weak tea.
The post came up once a month, when it came.
Every peak they had measured was a number in the field book and a white space on the sheet.`.split('\n'),
		leads: `{Name} sighted on the far cairn
{Name} inked a line and let it dry
{Name} read the angle twice and wrote it once
{Name} scraped the ice from the lens
{Name} unrolled the unfinished sheet
{Name} broke the ice in the bucket
{O} was bent over the plane table
{O} came in white to the knees`.split('\n'),
		pairs: `How high is it? | Higher than the last man said.
What do we call it? | Nothing, until it's measured.
Will the pass open? | In April. Or May. It has its own opinion.
Is that a road or a river? | On this sheet, it's a guess.
You've moved the hut. | By a hair. It was in the wrong valley.`.split('\n').map((l) => l.split(' | ')),
	},
};

// scene | whose it is (S Signe, H Halvard) | indent under the one before (> or -) | synopsis
const SCENES = `
The pass closes | S | - | Signe comes up with the last mule train and finds she cannot go down again.
Three in a hut for two | S | - | Halvard and Brandt make room for a draughtswoman they did not ask for.
The unfinished sheet | H | - | Halvard shows her the map: everything measured, nothing drawn.
First ink | S | - | Signe draws the first valley, and Brandt says it is wrong.
The far cairn | H | - | A sighting to the far peak that does not close by forty feet.
Forty feet | H | > | Halvard checks the arithmetic three times, alone, at night.
Brandt's figures | S | > | Signe finds the figures in the field book have been corrected, in another hand.
The post comes | S | - | The post comes up in December, with a letter for Brandt from the Survey office.
Midwinter | H | - | Midwinter: the stove, a bottle, and Brandt telling how he lost the first map.
Tove | S | - | Tove, who keeps the post house, tells Signe what the valley calls the peak.
The name | S | - | Signe writes the name on the sheet in pencil, where no name is allowed.
Thaw | H | - | The first avalanche of spring takes the north cairn.
Measuring again | H | - | Halvard and Signe measure the far peak again, and it closes.
The pass opens | S | - | The pass opens. The sheet goes down the mountain, with the name inked in.
`.trim().split('\n').map((l) => l.split(' | '));

export function winter(add, rand) {
	const w = writer(EN, WORLD, rand), who = { S: ['Signe', 'Cyan'], H: ['Halvard', 'Orange'] };
	let list = '';
	SCENES.forEach(([name, pov, nest, synopsis], i) => {
		const others = mentioned(WORLD, synopsis + ' ' + name).filter((n) => n !== who[pov][0]);
		if (!others.length) others.push(pov === 'S' ? 'Halvard' : 'Signe');
		add(`${name}.md`, note({ synopsis, status: i < 6 ? 'Revised' : i < 11 ? 'Draft' : 'Idea', label: who[pov][1], target: 1000 }, i < 12 ? text(w.scene({ pov: who[pov][0], others, words: 850 + Math.floor(rand() * 350) })) : ''));
		// (Longform nests a scene by putting it in a list of its own under the one before)
		list += nest === '>' ? `${SCENES[i - 1][2] === '>' ? '     ' : '    -'} - ${name}\n` : `    - ${name}\n`;
	});
	add('A page found later.md', note({ synopsis: 'A scene the list doesn’t mention: it shows after the listed ones.' }, text(w.scene({ pov: 'Signe', others: ['Tove'], words: 300, breaks: false }))));
	add('Research - surveying.md', 'Not a scene: `ignoredFiles` has `Research*`.\n\n- A theodolite measures angles; a chain measures distance.\n- A triangle that does not close has an error in it somewhere.\n');
	add('Snapshots/First ink/2026-09-18 20.12.44 Before Brandt speaks.snapshot', snapshot('First ink', '2026-09-18 20.12.44', text(w.scene({ pov: 'Signe', others: ['Brandt'], words: 500, breaks: false }))));
	add('Index.md', `---\nlongform:\n  format: scenes\n  title: The Cartographer's Winter\n  workflow: Default Workflow\n  sceneFolder: /\n  scenes:\n${list}  ignoredFiles:\n    - Research*\nauthor: Ingrid Solheim\nlanguage: en-GB\nsynopsis: Three people snowed in with an unfinished map, and one peak that will not measure the same twice.\ntarget: 15000\n---\nLongform’s index note. Binders writes only \`longform.scenes\` here, and shows the project as a binder: every scene is a chapter.\n`);
}
