import { parseStoryDate, writeStoryDate, type StoryDate } from '../src/time/date';
import { shiftDate, shiftWords, type ShiftUnit } from '../src/time/shift';
import { done, eq } from './harness';

const d = (s: string): StoryDate => { const x = parseStoryDate(s); if (!x) throw new Error('not a date: ' + s); return x; };
const shift = (s: string, by: number, unit: ShiftUnit) => { const r = shiftDate(d(s), by, unit); return r ? String(writeStoryDate(r)) : null; };

// days
eq(shift('1987-06-14', 3, 'd'), '1987-06-17', 'three days on');
eq(shift('1987-06-14', -14, 'd'), '1987-05-31', 'a fortnight back, across a month');
eq(shift('1987-12-30', 3, 'd'), '1988-01-02', 'across a year');
eq(shift('1988-02-28', 2, 'd'), '1988-03-01', 'across a leap day');
eq(shift('1987-02-28', 2, 'd'), '1987-03-02', 'and not across one that is not there');
eq(shift('1987-06-14', 0, 'd'), '1987-06-14', 'by nothing: as it is');
eq(shift('1987-06-14', 800, 'd'), '1989-08-22', 'a long way on');
eq(shift('0001-01-01', -1, 'd'), '0000-12-31', 'across year 0');
eq(shift('1987-06-14T21:30', 1, 'd'), '1987-06-15T21:30', 'a typed time goes along');
eq(shift('1987-06', 3, 'd'), null, 'a month cannot be moved by days');
eq(shift('1987', 3, 'd'), null, 'nor a year');
// months
eq(shift('1987-06-14', 2, 'm'), '1987-08-14', 'two months on');
eq(shift('1987-11-14', 3, 'm'), '1988-02-14', 'across a year');
eq(shift('1987-01-14', -2, 'm'), '1986-11-14', 'back across a year');
eq(shift('1987-01-31', 1, 'm'), '1987-02-28', 'a day that the month has not: its last');
eq(shift('1987-06', 7, 'm'), '1988-01', 'a month is moved by months');
eq(shift('1987', 7, 'm'), null, 'a year cannot be moved by months');
eq(shift('1987-06-14T21:30', 1, 'm'), '1987-07-14T21:30', 'a typed time goes along');
// years
eq(shift('1987-06-14', 2, 'y'), '1989-06-14', 'two years on');
eq(shift('1988-02-29', 1, 'y'), '1989-02-28', 'a leap day in a year without one: the day before');
eq(shift('1987-06', -3, 'y'), '1984-06', 'a month');
eq(shift('1987', 10, 'y'), '1997', 'a year');
eq(shift('0990', 20, 'y'), '1010', 'a year padded to four digits');
eq(shift('9990', 20, 'y'), null, 'past the last year there is');
eq(shift('-9990', -20, 'y'), null, 'and before the first');
// words
eq(shiftWords(3, 'd', 'later'), '3 days later', 'three days');
eq(shiftWords(1, 'm', 'later'), '1 month later', 'one month');
eq(shiftWords(2, 'y', 'earlier'), '2 years earlier', 'years, earlier');

done('story-shift');
