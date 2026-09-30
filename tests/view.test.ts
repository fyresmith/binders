import { countWords, wordsLabel } from '../src/view/words';
import { display, labelColor } from '../src/view/labels';
import { done, eq } from './harness';

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

// labels
eq(labelColor('Red'), 'red', 'a color name, any case');
eq(labelColor(' blue '), 'blue', 'trimmed');
eq(labelColor('Flashback'), 'other', 'any other label is neutral');
eq(labelColor(''), null, 'no label');
eq(display('draft'), 'Draft', 'shown in sentence case');

done('view helpers');
