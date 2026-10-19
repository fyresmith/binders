import { cleanHeading, headingTitle, pickShownName, readTitle, shownNameAt } from '../src/shown-name';
import { readSettings, DEFAULT_SETTINGS, PROPS } from '../src/settings-data';
import { done, eq } from './harness';

// the title a note has
eq(readTitle({ title: 'The ferry' }, 'title'), 'The ferry', 'a text title');
eq(readTitle({ title: '  Two   words \n here ' }, 'title'), 'Two words here', 'its whitespace is folded and trimmed');
eq(readTitle({ title: 1984 }, 'title'), '1984', 'a number is its digits');
eq(readTitle({ title: '' }, 'title'), null, 'an empty title is none');
eq(readTitle({ title: '   ' }, 'title'), null, 'a blank title is none');
eq(readTitle({ title: ['a', 'b'] }, 'title'), null, 'a list is none');
eq(readTitle({ title: true }, 'title'), null, 'a yes/no is none');
eq(readTitle({}, 'title'), null, 'no property: none');
eq(readTitle(undefined, 'title'), null, 'no properties at all: none');
eq(readTitle({ Title: 'Capital' }, 'title'), null, 'the property name is exact');
eq(readTitle({ name: 'By another name' }, 'name'), 'By another name', 'under the name settings give it');

// what is shown
eq(pickShownName({ title: 'Arrival' }, 'title', 'a8f3k'), 'Arrival', 'a note with a title is shown by it');
eq(pickShownName({ synopsis: 'x' }, 'title', 'Arrival'), 'Arrival', 'one without is shown by its file name');
eq(pickShownName({ title: '' }, 'title', 'Arrival'), 'Arrival', 'an empty title falls back to the file name');
eq(pickShownName(null, 'title', 'Arrival'), 'Arrival', 'a note with no properties too');
// (before the plugin is loaded there is no vault to ask)
eq(shownNameAt('Anything.md', 'fallback'), 'fallback', 'by path, with no vault: the fallback');

// the setting
eq(DEFAULT_SETTINGS.titleProp, 'title', 'the title property is “title” to begin with');
eq(PROPS[0], 'titleProp', 'and is the first of the property names');
eq(readSettings({ titleProp: ' name ' }).titleProp, 'name', 'it can be renamed like the others');
eq(readSettings({ titleProp: '  ' }).titleProp, 'title', 'a blank name is the default');

// named from a heading
const H = [{ heading: '#26-10-19-14-41-39', level: 2 }, { heading: 'Actual title', level: 3 }, { heading: 'Subtitle', level: 4 }, { heading: 'Later', level: 3 }];
eq(headingTitle(H, 'h3'), 'Actual title', 'the first heading of the level, not the first heading');
eq(headingTitle(H, 'h2'), null, 'a stamp that is only a tag says nothing');
eq(headingTitle(H, 'any'), 'Actual title', 'any level: the first that says something');
eq(headingTitle(H, 'h5'), null, 'no heading of the level: none');
eq(headingTitle(H, 'property'), null, 'chosen off: none');
eq(headingTitle(undefined, 'h3'), null, 'no headings: none');
eq(headingTitle([{ heading: '#working', level: 3 }, { heading: 'Real', level: 3 }], 'h3'), 'Real', 'a heading of nothing but a tag is passed over');
eq(cleanHeading('#working-title Current **title** of [[Note|the scene]] and [a link](http://x) <!-- old -->'), 'Current title of the scene and a link', 'tags, comments, brackets and emphasis go');
eq(cleanHeading('Chapter #3: _Ferry_'), 'Chapter #3: Ferry', 'a number after a hash is not a tag');
eq(cleanHeading('snake_case name'), 'snake_case name', 'underscores inside a word stay');
eq(pickShownName({ title: 'Own' }, 'title', 'file', H, 'h3'), 'Own', 'the title property wins over a heading');
eq(pickShownName({}, 'title', 'file', H, 'h3'), 'Actual title', 'a heading before the file name');
eq(pickShownName({}, 'title', 'file', H, 'h5'), 'file', 'and the file name when there is none');
eq(readSettings({ titleFrom: 'h3' }).titleFrom, 'h3', 'the choice is read back');
eq(readSettings({ titleFrom: 'h9' }).titleFrom, 'property', 'one that is not a choice is the default');

done('shown name');
