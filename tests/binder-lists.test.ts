import { readOwnLabels, readOwnStatuses, sameLabels, sameStatuses, writeOwnLabels } from '../src/binder-lists';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// a binder's own labels: `- Mara: blue` (a one-key map), `{name, color}`, and a bare name
eq(j(readOwnLabels([{ Mara: 'blue' }, { name: 'Ilse', color: 'green' }, 'Plain'])), j([{ name: 'Mara', color: 'blue' }, { name: 'Ilse', color: 'green' }, { name: 'Plain', color: 'red' }]), 'both spellings and a bare name are read');
eq(readOwnLabels(undefined), null, 'no property: none of its own');
eq(readOwnLabels('blue'), null, 'a text is not a list');
eq(j(readOwnLabels([])), '[]', 'an empty list: no labels at all');
eq(j(readOwnLabels([{ Mara: 'blue' }, { mara: 'red' }, { '': 'red' }, 7])), j([{ name: 'Mara', color: 'blue' }]), 'repeats, blanks and junk are left out');
eq(j(readOwnLabels([{ Custom: '#ABC' }])), j([{ name: 'Custom', color: '#aabbcc' }]), 'a hex color is kept as six digits');

// written, then read back
const list = [{ name: 'Mara', color: 'blue' }, { name: 'Ilse: the elder', color: '#c0392b' }];
eq(j(readOwnLabels(writeOwnLabels(list))), j(list), 'labels written are read back as they were');
eq(j(writeOwnLabels(list)), j([{ Mara: 'blue' }, { 'Ilse: the elder': '#c0392b' }]), 'one name: color map each');

// statuses
eq(j(readOwnStatuses(['Idea', ' Draft ', 'draft', 3, ''])), j(['Idea', 'Draft']), 'statuses are trimmed, unique and text');
eq(readOwnStatuses(undefined), null, 'no property: the vault’s');
eq(j(readOwnStatuses([])), '[]', 'an empty list: no statuses');

ok(sameLabels(list, list.map((l) => ({ ...l }))), 'the same labels are the same');
ok(!sameLabels(list, [list[0]]), 'a shorter list differs');
ok(!sameLabels(list, [list[0], { name: 'Ilse: the elder', color: 'red' }]), 'a color differs');
ok(sameStatuses(['a', 'b'], ['a', 'b']) && !sameStatuses(['a', 'b'], ['b', 'a']), 'statuses are compared in order');

done('binder-lists');
