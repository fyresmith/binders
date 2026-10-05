import { countWords, wordsLabel } from '../src/view/words';
import { readSettings } from '../src/settings-data';
import { DEFAULT_LABELS, DEFAULT_STATUSES, canonical, display, freeName, hexColor, labelCss, labelKind, labelName, rank, readLabels, readStatuses, type LabelPreset } from '../src/view/labels';
import { done, eq, ok } from './harness';

// word counts, as Obsidian's status bar counts them (specs-view.mjs checks them against it)
eq(countWords('He met her at the foot of the tower and did not move out of the doorway.'), 17, 'a sentence');
eq(countWords('---\nsynopsis: Not counted at all.\nstatus: draft\n---\nThree words here.'), 3, 'properties don’t count');
eq(countWords('---\r\nstatus: draft\r\n---\r\nOne two.'), 2, 'Windows line endings');
eq(countWords("Don't stop — well-known, co-op; 3.14 is 1,000."), 7, 'apostrophes, hyphens and numbers join words');
eq(countWords('A — dash, and a hyphen-ated word.'), 6, 'a dash alone isn’t a word; a hyphenated word is one');
eq(countWords('日本語の文'), 5, 'CJK characters count one each');
eq(countWords(''), 0, 'empty');
eq(countWords('---\nstatus: draft\n---\n'), 0, 'only properties');
eq(countWords('# Heading\n\n- a list item\n- [ ] a task'), 8, 'a list’s hyphens count, as in Obsidian’s status bar');
eq(wordsLabel(1), '1 word', 'one word');
eq(wordsLabel(12345), `${(12345).toLocaleString()} words`, 'many words');

// labels: the ones in settings, Obsidian's colors by name, and colors of a note's own
{
	const presets: LabelPreset[] = [...DEFAULT_LABELS, { name: 'Flashback', color: '#C0392B' }, { name: 'Mara', color: 'green' }];
	eq(labelKind('Red', presets), 'red', 'a color name, any case');
	eq(labelKind(' blue ', presets), 'blue', 'trimmed');
	eq(labelKind('Flashback', presets), 'custom', 'a label from settings with a color of its own');
	eq(labelCss('flashback', presets), '#c0392b', 'its color, whatever case the note has the name in');
	eq(labelKind('Mara', presets), 'green', 'a label from settings in one of Obsidian’s colors');
	eq(labelCss('Mara', presets), 'var(--color-green)', 'the theme’s own shade of it');
	eq(labelKind('Unheard of', presets), 'other', 'any other label is neutral');
	eq(labelCss('Unheard of', presets), 'var(--text-faint)', 'and shows faintly');
	eq(labelKind('', presets), null, 'no label');
	eq(labelCss('', presets), null, 'no color');
	eq(labelKind('#0AF', presets), 'custom', 'a color itself is a custom color');
	eq(labelCss('#0AF', presets), '#00aaff', 'three digits or six');
	eq(labelCss('teal', []), 'var(--text-faint)', 'without any labels in settings, only Obsidian’s colors and hex colors show');
	eq(labelCss('pink', []), 'var(--color-pink)', 'Obsidian’s colors always do');
	eq(labelName('blue', presets), 'Blue', 'named as settings spell it');
	eq(labelName('#0af', presets), 'Custom color', 'a color of its own');
	eq(labelName('plot twist', presets), 'Plot twist', 'anything else in sentence case');
	eq(hexColor('#12345'), null, 'not a color');
	eq(hexColor('red'), null, 'a name isn’t a hex color');
	eq(canonical('DRAFT', DEFAULT_STATUSES), 'Draft', 'a status as settings spell it');
	eq(canonical(' in progress ', DEFAULT_STATUSES), 'in progress', 'or as written, trimmed');
	eq(display('draft'), 'Draft', 'shown in sentence case');
	eq(freeName('New label', ['New label', 'new label 2']), 'New label 3', 'a name that isn’t taken');
	eq(rank('revised', DEFAULT_STATUSES), 2, 'where a status comes in the list');
	eq(rank('abandoned', DEFAULT_STATUSES), DEFAULT_STATUSES.length, 'after them all if it isn’t one');
	// saved settings, put right
	eq(JSON.stringify(readLabels([{ name: ' POV ', color: 'BLUE' }, { name: 'pov', color: 'red' }, { name: 'Odd', color: 'nonsense' }, { name: '', color: 'red' }, 'x', null, { name: 'Hex', color: '#ABC' }])),
		JSON.stringify([{ name: 'POV', color: 'blue' }, { name: 'Odd', color: 'red' }, { name: 'Hex', color: '#aabbcc' }]), 'labels: trimmed, unique by name, colors made valid');
	eq(readLabels('nope'), null, 'not a list: the defaults are used');
	eq(JSON.stringify(readStatuses(['Draft', ' draft ', '', 3, 'Done'])), JSON.stringify(['Draft', 'Done']), 'statuses: text, trimmed, unique');
	const s = readSettings({ orderExplorer: false, labels: [{ name: 'A', color: 'red' }], statuses: 'x', synopsisProp: '  ', labelProp: 'colour', plotlinesProp: 'threads', outlinerColumns: ['words', { id: 'prop:POV', width: 5000 }, 'nonsense', 'words'] });
	eq(s.orderExplorer, false, 'settings: a saved toggle');
	eq(s.hideBinderNotes, true, 'settings: a missing one is its default');
	eq(s.synopsisProp, 'synopsis', 'settings: a blank property name is the default');
	eq(s.labelProp, 'colour', 'settings: a saved property name');
	eq(JSON.stringify(s.labels), JSON.stringify([{ name: 'A', color: 'red' }]), 'settings: saved labels');
	eq(JSON.stringify(s.statuses), JSON.stringify(DEFAULT_STATUSES), 'settings: statuses that aren’t a list are the defaults');
	eq(JSON.stringify(s.outlinerColumns), JSON.stringify([{ id: 'words' }, { id: 'prop:POV', width: 640 }]), 'settings: known columns, once each, widths in bounds');
	ok(!('plotlinesProp' in s), 'settings: what earlier versions saved and this one doesn’t use is dropped');
	ok(readSettings(null).labels !== DEFAULT_LABELS && readSettings(null).labels[0] !== DEFAULT_LABELS[0], 'settings: the defaults are copied, never shared');
}

// export's settings
{
	const d = readSettings(null);
	eq([d.exportsFolder, d.authorName, d.contact, d.exportKind, d.exportMatter, d.compile.stripTabs].join('|'), 'Exports|||manuscript|false|true', 'export: the defaults');
	const s = readSettings({ exportsFolder: '  Books/Out ', authorName: 'A Writer', contact: 'a\nb', exportKind: 'note', exportMatter: true, exportStyle: 'Plain, for a typesetter', compile: { stripTabs: false } });
	eq([s.exportsFolder, s.authorName, s.contact, s.exportKind, s.exportMatter, s.exportStyle, s.compile.stripTabs].join('|'), 'Books/Out|A Writer|a\nb|note|true|Plain, for a typesetter|false', 'export: read back as saved');
	eq([readSettings({ exportsFolder: '  ', exportKind: 'pdf', authorName: 3 }).exportsFolder, readSettings({ exportKind: 'pdf' }).exportKind, readSettings({ authorName: 3 }).authorName].join('|'), 'Exports|manuscript|', 'export: what isn’t well formed is the default');
}

done('view helpers');
