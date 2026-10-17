import { pickShownName, readTitle, shownNameAt } from '../src/shown-name';
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

done('shown name');
