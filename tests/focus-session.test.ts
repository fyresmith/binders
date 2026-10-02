import { Session, atEnd, bodyStart, dayOf, excerpt, parseGoal } from '../src/focus/session';
import { DEFAULT_SETTINGS, FOCUS_TOGGLES, focusToggles, readSettings } from '../src/settings-data';
import { done, eq, ok } from './harness';

// the day, in local time
eq(dayOf(new Date(2026, 9, 1, 23, 59)), '2026-10-01', 'a day is written YYYY-MM-DD');
eq(dayOf(new Date(2026, 0, 5, 0, 0)), '2026-01-05', 'with leading zeros');

// words that arrive from another device aren't written here today
{
	const s = new Session(null, '2026-10-01');
	s.see('Novel/One.md', 101, 100);
	eq(s.words('Novel'), 1, 'one word typed, and saved');
	s.shift('Novel/One.md', 100, 101);
	eq(s.words('Novel'), 1, 'a hundred words arrive from elsewhere: still one written here');
	s.see('Novel/One.md', 202);
	eq(s.words('Novel'), 2, 'the next word typed is the second');
	// with typing not saved yet: the note on disk had 202, the editor has 205
	s.see('Novel/One.md', 205);
	s.shift('Novel/One.md', 10, 202);
	eq(s.words('Novel'), 0, 'for the moment before the editor takes the words in, nothing is counted twice');
	s.see('Novel/One.md', 215);
	eq(s.words('Novel'), 5, 'once it has, the three typed and not yet saved are counted, the ten that arrived are not');
	s.shift('Novel/One.md', -20, 215);
	eq(s.words('Novel'), 5, 'words taken out elsewhere aren’t taken off what was written here');
	s.shift('Novel/Unseen.md', 50, 0);
	eq(s.words('Novel'), 5, 'a note not counted today has nothing to move');
}

// a merge: the words written today in the note that goes are still written, in the note that has its text
{
	const s = new Session(null, '2026-10-01');
	s.see('Novel/A.md', 120, 100);
	s.see('Novel/K.md', 80, 50);
	eq(s.words('Novel'), 50, 'twenty words in one note, thirty in another');
	s.shift('Novel/A.md', 80, 120); // K's text arrives in A
	eq(s.now('Novel/A.md'), 200, 'the merged note has both texts');
	s.merged('Novel/K.md', 'Novel/A.md');
	eq(s.words('Novel'), 50, 'merged, the day has the same fifty');
	ok(!s.has('Novel/K.md'), 'the note that went is forgotten');
	s.see('Novel/A.md', 201);
	eq(s.words('Novel'), 51, 'and typing goes on counting');
	s.merged('Novel/Gone.md', 'Novel/A.md');
	eq(s.words('Novel'), 51, 'a note that wasn’t counted has nothing to give');
}

// a session: each note counted from what it had when first seen today
{
	const s = new Session(null, '2026-10-01');
	eq(s.words('Novel'), 0, 'nothing seen, nothing written');
	s.see('Novel/One.md', 100);
	eq(s.words('Novel'), 0, 'a note seen for the first time is what the day is counted from');
	s.see('Novel/One.md', 130);
	eq(s.words('Novel'), 30, 'words typed since');
	s.see('Novel/Part/Two.md', 50, 40);
	eq(s.words('Novel'), 40, 'a note first seen with typing already in it is counted from what it had before');
	eq(s.words('Novel/Part'), 10, 'a folder of the binder counts its own notes');
	s.see('Other/Three.md', 500, 0);
	eq(s.words('Novel'), 40, 'another binder’s words aren’t this one’s');
	eq(s.words('Other'), 500, 'they’re its own');
	eq(s.words('Nov'), 0, 'a folder whose name another’s starts with isn’t that folder');
	s.see('Novel/One.md', 90);
	eq(s.words('Novel'), 0, 'words deleted count against words written, and never go below none');
	s.see('Novel/One.md', 130);
	// a note split: its words go to a new note, which is counted from nothing
	s.see('Novel/One.md', 70);
	s.see('Novel/One b.md', 60, 0);
	eq(s.words('Novel'), 40, 'a note split in two counts once');
	// renamed and moved
	s.rename('Novel/One.md', 'Novel/First.md');
	ok(s.has('Novel/First.md') && !s.has('Novel/One.md'), 'a renamed note keeps its counts');
	eq(s.words('Novel'), 40, 'and the total is as it was');
	s.rename('Novel', 'Book');
	eq(s.words('Book'), 40, 'a renamed binder keeps its notes’ counts');
	eq(s.words('Novel'), 0, 'under its new name only');
	ok(s.has('Book/Part/Two.md'), 'notes in its folders too');
	s.rename('Book/Part', 'Book/Chapter');
	eq(s.words('Book/Chapter'), 10, 'a renamed folder');
	// deleted
	s.remove('Book/One b.md');
	eq(s.words('Book'), 0, 'a deleted note’s words are no longer written (here that leaves fewer than the day began with)');
	s.see('Book/First.md', 200);
	eq(s.words('Book'), 110, 'and writing goes on: the total is the net of every note, whatever it was in between');
	// counting from here
	s.reset('Book');
	eq(s.words('Book'), 0, 'counting starts again');
	eq(s.words('Other'), 500, 'for that binder only');
	s.see('Book/First.md', 212);
	eq(s.words('Book'), 12, 'from where it was');
	// kept and read back
	const kept: unknown = JSON.parse(JSON.stringify(s));
	const again = new Session(kept, '2026-10-01');
	eq(again.words('Book'), 12, 'a session read back the same day carries on');
	eq(again.words('Other'), 500, 'every binder’s');
	const next = new Session(kept, '2026-10-02');
	eq(next.words('Other'), 0, 'read back another day, it’s a new session');
	eq(next.day, '2026-10-02', 'of that day');
	// a new day
	ok(!again.roll('2026-10-01'), 'the same day: the same session');
	ok(!again.roll('2026-10-02', true), 'past midnight with writing under way, the session carries on');
	eq(again.words('Book'), 12, 'with its words');
	ok(again.roll('2026-10-02'), 'once it’s left, a new day is a new session');
	eq(again.words('Book'), 0, 'from nothing');
	again.see('Book/First.md', 212);
	again.see('Book/First.md', 220);
	eq(again.words('Book'), 8, 'counted from what the notes have that day');
}

// what was kept may be anything
for (const bad of [undefined, null, 3, 'x', [], {}, { day: '2026-10-01' }, { day: '2026-10-01', notes: 4 }, { day: 5, notes: {} }]) {
	const s = new Session(bad, '2026-10-01');
	eq(s.words(''), 0, `nonsense read back is an empty session (${JSON.stringify(bad)})`);
}
{
	const s = new Session({ day: '2026-10-01', notes: { 'A/x.md': [1, 5], 'A/y.md': ['1', 5], 'A/z.md': [1], 'A/w.md': null, 'A/v.md': [NaN, 2] } }, '2026-10-01');
	eq(s.words('A'), 4, 'entries that aren’t two numbers are dropped, the rest kept');
	eq(s.words(''), 4, 'the whole vault');
}

// the last line: everything after the line the cursor is on is blank
{
	const t = 'One.\n\nTwo is the last paragraph.\n';
	ok(atEnd(t, t.indexOf('Two')), 'at the start of the last paragraph');
	ok(atEnd(t, t.indexOf('last')), 'in the middle of it');
	ok(atEnd(t, t.length - 1), 'at its end');
	ok(atEnd(t, t.length), 'on the empty line after it');
	ok(!atEnd(t, 0), 'not in the first paragraph');
	ok(!atEnd(t, 4), 'nor at its end');
	ok(!atEnd(t, 5), 'nor on the blank line between');
	ok(atEnd('', 0), 'an empty note is all last line');
	ok(atEnd('One line', 3), 'a note of one line');
	ok(atEnd('One.\n\nTwo.\n\n\n  \n', 6), 'blank lines after the last paragraph don’t count');
	ok(atEnd('One.\n\nTwo.\n\n\n', 12), 'a new line begun after it is the last line');
	ok(!atEnd('---\nstatus: x\n---\nOne.\n\nTwo.', 2), 'not in the properties');
	ok(atEnd('a\r\nb\r\n', 3), 'Windows line endings');
}

// where the text starts
eq(bodyStart('---\nstatus: draft\n---\nText'), 22, 'after the properties');
eq(bodyStart('Text'), 0, 'no properties');
eq(bodyStart('---\n---\nText'), 8, 'empty properties');

// what's shown of the scene before and after
{
	const note = '---\nstatus: draft\n---\nFirst paragraph here.\n\nSecond one.\n\nThird.\n\nFourth and last.\n';
	eq(excerpt(note, false), 'First paragraph here.\n\nSecond one.\n\nThird.', 'the start of the scene after: its first three paragraphs, without its properties');
	eq(excerpt(note, true), 'Second one.\n\nThird.\n\nFourth and last.', 'the end of the scene before: its last three, in order');
	eq(excerpt(note, true, 1), 'Fourth and last.', 'as many paragraphs as asked for');
	const long = Array.from({ length: 200 }, (_x, i) => `w${i}`).join(' ');
	eq(excerpt(`${long}\n\nShort.`, false), long, 'a long first paragraph is shown whole, alone');
	eq(excerpt(`Short.\n\n${long}`, false), 'Short.', 'paragraphs are taken while they fit in about a hundred words');
	eq(excerpt(`${long}\n\nShort.`, true), 'Short.', 'from the end too');
	eq(excerpt('', true), '', 'an empty note shows nothing');
	eq(excerpt('---\nstatus: idea\n---\n', false), '', 'nor one with only properties');
	eq(excerpt('One.\r\n\r\nTwo.\r\n', true), 'One.\n\nTwo.', 'Windows line endings');
	eq(excerpt('- a\n- b\n\nText.', false), '- a\n- b\n\nText.', 'a list is one block');
}

// a goal as typed
eq(parseGoal('500'), 500, 'a number');
eq(parseGoal(' 1,500 '), 1500, 'with a comma');
eq(parseGoal(''), 0, 'nothing is no goal');
eq(parseGoal('0'), 0, 'nor is none');
eq(parseGoal('many'), null, 'words aren’t a number');
eq(parseGoal('-5'), null, 'nor is less than none');
eq(parseGoal('2.5k'), null, 'nor shorthand');

// the settings: typewriter scrolling is the only thing on to begin with
{
	const d = DEFAULT_SETTINGS;
	ok(d.focusTypewriter, 'typewriter scrolling is on by default');
	ok(d.focusDim, 'and so is dimming the other paragraphs');
	ok(!d.focusPlace && !d.focusNumbers && !d.focusNeighbours && !d.focusFullscreen, 'everything else in focus mode is off by default, fullscreen too');
	eq(d.focusGoal, 0, 'and there’s no goal');
	eq(FOCUS_TOGGLES.length, 6, 'six things to turn on or off');
	ok(!focusToggles(true).includes('focusFullscreen') && focusToggles(false).includes('focusFullscreen'), 'fullscreen is only offered where there is a window');
	const s = readSettings({ focusPlace: true, focusNumbers: 'yes', focusTypewriter: false, focusGoal: 750 });
	ok(s.focusPlace && !s.focusNumbers && !s.focusTypewriter, 'read back as saved; what isn’t true or false is the default');
	eq(s.focusGoal, 750, 'the goal as saved');
	eq(readSettings({ focusGoal: -3 }).focusGoal, 0, 'a goal that isn’t a whole number of words is none');
	eq(readSettings({ focusGoal: 2.5 }).focusGoal, 0, 'nor a fraction');
	eq(readSettings({ focusGoal: '500' }).focusGoal, 0, 'nor text');
	ok(readSettings(null).focusTypewriter, 'with nothing saved, the defaults');
}

done('focus session');
