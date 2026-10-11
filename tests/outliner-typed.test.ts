import { cellParts, readTyped } from '../src/view/outliner-typed';
import { done, eq } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// typing is read by the property's type, not by what the value was
eq(j(readTyped('12', 'number')), j({ value: 12 }), 'a number');
eq(j(readTyped(' -2.5 ', 'number')), j({ value: -2.5 }), 'a decimal');
eq(j(readTyped('', 'number')), j({ value: undefined }), 'nothing typed takes the property away');
eq('error' in readTyped('twelve', 'number'), true, 'a word in a number is refused, not turned into text');
eq(j(readTyped('Mara,  Ines ,', 'multitext')), j({ value: ['Mara', 'Ines'] }), 'a list is split at commas');
eq(j(readTyped('Mara', 'multitext')), j({ value: ['Mara'] }), 'one item is still a list, whatever the value was');
eq(j(readTyped('a, b', 'tags')), j({ value: ['a', 'b'] }), 'tags too');
eq(j(readTyped('  ', 'aliases')), j({ value: undefined }), 'an emptied list is removed');
eq(j(readTyped('Mara, Ines', 'text')), j({ value: 'Mara, Ines' }), 'a text with a comma stays one text');
eq(j(readTyped('12', 'text')), j({ value: '12' }), 'a number typed in a text is text');
eq(j(readTyped('2026-03-04', 'date')), j({ value: '2026-03-04' }), 'a date');
eq('error' in readTyped('next week', 'date'), true, 'a date must be written as one');
eq(j(readTyped('2026-03-04T10:30', 'datetime')), j({ value: '2026-03-04T10:30' }), 'a date and time');
eq('error' in readTyped('2026-03-04', 'datetime'), true, 'a date without its time is not a date and time');
eq(j(readTyped('yes', 'checkbox')), j({ value: true }), 'a box typed');
eq(j(readTyped('false', 'checkbox')), j({ value: false }), 'a box typed off');
eq('error' in readTyped('maybe', 'checkbox'), true, 'not a box');
eq(j(readTyped('[[Mara]]', 'text')), j({ value: '[[Mara]]' }), 'a link typed stays as typed');

// what a cell shows: links as links
eq(j(cellParts('[[Mara]]')), j([{ text: 'Mara', href: 'Mara' }]), 'a link, by its name');
eq(j(cellParts('[[People/Mara|the newcomer]]')), j([{ text: 'the newcomer', href: 'People/Mara' }]), 'shown as it says, pointing where it points');
eq(j(cellParts(['[[Mara]]', 'The master', 3])), j([{ text: 'Mara', href: 'Mara' }, { text: 'The master' }, { text: '3' }]), 'a list: links and text and numbers');
eq(j(cellParts('Mara')), j([{ text: 'Mara' }]), 'plain text');
eq(j(cellParts(null)), j([]), 'nothing');
eq(j(cellParts(true)), j([{ text: 'true' }]), 'a box');
eq(j(cellParts('[[Mara#Early life]]')), j([{ text: 'Mara', href: 'Mara#Early life' }]), 'a heading link opens at the heading');

done('outliner typed');
