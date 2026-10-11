import { BLOCK, changeWords, frontOf, transactionWords, type Doc } from '../src/progress/count';
import { recordDay, hourOf } from '../src/progress/day';
import { FORMAT, fileName, moveKind, parseFile, parseName } from '../src/progress/format';
import { Ledger, type Device } from '../src/progress/ledger';
import { merge, toHistory, statusOn, type Source } from '../src/progress/merge';
import { done, eq, ok } from './harness';

const doc = (s: string): Doc => ({ length: s.length, sliceString: (a, b) => s.slice(a, b) });
/** A change as CodeMirror reports it, from the text before and after, for one edit at `at` removing `cut` and putting `put`. */
const edit = (before: string, at: number, cut: number, put: string) => {
	const after = before.slice(0, at) + put + before.slice(at + cut);
	return changeWords(doc(before), doc(after), { fromA: at, toA: at + cut, fromB: at, toB: at + put.length });
};
const t = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const dev = (id: string, kind: Device['kind'] = 'desktop'): Device => ({ id, label: id.toUpperCase(), kind });

// ---- the day ends at four in the morning, local time ----
eq(recordDay(new Date(2026, 9, 10, 12, 0)), '2026-10-10', 'noon is that day');
eq(recordDay(new Date(2026, 9, 11, 3, 59)), '2026-10-10', 'a quarter to four in the morning is still the day before');
eq(recordDay(new Date(2026, 9, 11, 4, 0)), '2026-10-11', 'four o’clock starts the day');
eq(recordDay(new Date(2026, 0, 1, 1, 30)), '2025-12-31', 'a year turns at four, not at midnight');
eq(recordDay(new Date(2026, 2, 1, 2, 0)), '2026-02-28', 'the day before the first of March');
eq(recordDay(new Date(2028, 2, 1, 2, 0)), '2028-02-29', 'a leap year’s');
eq(hourOf(new Date(2026, 9, 11, 3, 59)), 3, 'the hour is the clock’s');

// ---- typing against a block change ----
eq(BLOCK, 50, 'a block is more than fifty words');
{
	const a = edit('The keeper ', 11, 0, 'waited');
	eq(`${a.added} ${a.cut} ${a.block}`, '1 0 0', 'a word begun is a word added');
	const b = edit('The keeper wai', 14, 0, 't');
	eq(`${b.added} ${b.cut} ${b.block}`, '0 0 0', 'a letter on a word that is there adds none');
	const c = edit('The keeper waited', 11, 6, '');
	eq(`${c.added} ${c.cut} ${c.block}`, '0 1 0', 'a word deleted is cut');
	const d = edit('The keeper waited.', 3, 0, ' old');
	eq(`${d.added} ${d.cut} ${d.block}`, '1 0 0', 'a word typed in the middle');
	const e = edit('one two', 3, 1, '');
	eq(`${e.added} ${e.cut} ${e.block}`, '0 1 0', 'two words joined by deleting the space is one fewer');
	const f = edit('onetwo', 3, 0, ' ');
	eq(`${f.added} ${f.cut} ${f.block}`, '1 0 0', 'and one split by a space is one more');
	const g = edit('one two three', 4, 3, 'ten');
	eq(`${g.added} ${g.cut} ${g.block}`, '0 0 0', 'a word typed over a word is neither');
}
{
	const fifty = Array(50).fill('word').join(' '), fiftyOne = Array(51).fill('word').join(' ');
	const a = edit('Start. ', 7, 0, fifty);
	eq(`${a.added} ${a.cut} ${a.block}`, '50 0 0', 'fifty words at once are still typing');
	const b = edit('Start. ', 7, 0, fiftyOne);
	eq(`${b.added} ${b.cut} ${b.block}`, '0 0 51', 'fifty-one are brought in');
	const c = edit('Start. ' + fiftyOne, 7, fiftyOne.length, '');
	eq(`${c.added} ${c.cut} ${c.block}`, '0 0 -51', 'and fifty-one taken out are not cut');
	const d = edit('Start. ' + fifty, 7, fifty.length, '');
	eq(`${d.added} ${d.cut} ${d.block}`, '0 50 0', 'fifty cut');
	const text = Array(300).fill('lorem').join(' ');
	const e = edit('', 0, 0, text);
	eq(e.block, 300, 'a paste of three hundred words');
	const f = edit(text, 0, text.length, 'x');
	eq(`${f.added} ${f.cut} ${f.block}`, '0 0 -299', 'a selection pasted over by one word: three hundred fewer is a block taken out');
	const g = edit('a b c ' + text, 6, text.length, text);
	eq(`${g.added} ${g.cut} ${g.block}`, '0 0 0', 'the same words put back over themselves');
}

// ---- a transaction is counted whole ----
{
	// a paragraph dragged elsewhere in the note: taken out here, put in there; no writing
	const para = Array(30).fill('keeper').join(' ');
	const before = para + ' middle ' + 'end', after = 'middle ' + para + ' end';
	const w = transactionWords(doc(before), doc(after), [{ fromA: 0, toA: para.length + 1, fromB: 0, toB: 0 }, { fromA: para.length + 8, toA: para.length + 8, fromB: 7, toB: 7 + para.length + 1 }]);
	eq(`${w.added} ${w.cut} ${w.block}`, '0 0 0', 'text moved within a note is neither added nor cut');
	// words in the properties are not writing
	const note = '---\nsynopsis: one two three\nstatus: draft\n---\nBody text';
	const front = frontOf(doc(note));
	eq(note.slice(front), 'Body text', 'the text starts after the properties');
	const p = transactionWords(doc(note), doc(note.replace('one two three', 'one two three four five')), [{ fromA: 22, toA: 22, fromB: 22, toB: 27 }], front);
	eq(`${p.added} ${p.cut} ${p.block}`, '0 0 0', 'a change in the properties counts for nothing');
	eq(frontOf(doc('No properties here')), 0, 'a note with none starts at its first character');
}

// ---- a rename stays in its folder, a move leaves it ----
eq(moveKind('Gull', 'Gull calls'), 'renamed', 'a note at the top of the binder renamed');
eq(moveKind('Part One/Gull', 'Part One/Calls'), 'renamed', 'a note in a folder renamed');
eq(moveKind('Part One/Gull', 'Part Two/Gull'), 'moved', 'a note in another folder is moved');
eq(moveKind('Gull', 'Part Two/Gull'), 'moved', 'a note from the top into a folder');
eq(moveKind('Part One/Gull', 'Gull'), 'moved', 'and out of it');

// ---- file names ----
eq(fileName(2026, 'MacBook', 'a1b2'), '2026 MacBook a1b2.binder-history', 'a file is named for the year, the device’s label and its id');
eq(fileName(2026, 'Caleb’s/Mac: 1', 'a1b2'), '2026 Caleb’s Mac 1 a1b2.binder-history', 'a label has nothing in it a file name can’t');
eq(JSON.stringify(parseName('2026 MacBook a1b2.binder-history')), JSON.stringify({ year: 2026, label: 'MacBook', id: 'a1b2' }), 'a name is read back');
eq(JSON.stringify(parseName('2026 My old laptop 00ff.binder-history')), JSON.stringify({ year: 2026, label: 'My old laptop', id: '00ff' }), 'a label of several words');
eq(parseName('notes.txt'), null, 'a name that isn’t one');

// ---- a ledger: one device’s year ----
const A = dev('a1b2');
{
	const l = new Ledger(A, 2026);
	const at = t(2026, 10, 10, 21, 35);
	l.typed(at, 'Part One/Arrival', 12, 2);
	l.typed(at + 60_000, 'Part One/Arrival', 3, 0);
	l.typed(at + 2 * 60_000, 'Part Two/Storm', 5, 1);
	l.block(at + 3 * 60_000, 'Part One/Arrival', 300);
	l.block(at + 4 * 60_000, 'Part One/Arrival', -80);
	eq(l.net('2026-10-10', ''), 17, 'the day’s net: added less cut, a block change not in it');
	eq(l.net('2026-10-10', 'Part One'), 13, 'and under one folder');
	// a pause of thirty minutes ends a sitting; less does not
	l.typed(at + 20 * 60_000, 'Part One/Arrival', 1, 0);
	l.typed(at + 51 * 60_000, 'Part One/Arrival', 1, 0);
	l.stamp(at + 52 * 60_000, { w: 5000, n: 12, st: { draft: 4000, '': 1000 } });
	l.event({ at, k: 'made', p: 'Part Three/New' });
	const text = l.serialize();
	const lines = text.trimEnd().split('\n');
	const head = JSON.parse(lines[0]) as Record<string, unknown>;
	eq(head['binders-history'], FORMAT, 'the first line says the format');
	eq(head.device, 'a1b2', 'and the device');
	ok(lines.every((x) => { try { JSON.parse(x); return true; } catch { return false; } }), 'every line is JSON on its own');
	const p = parseFile(text);
	eq(p.days.length, 1, 'a day’s line');
	eq(p.days[0].d, '2026-10-10', 'for the day');
	eq(JSON.stringify(p.days[0].n['Part One/Arrival']), JSON.stringify([17, 2, 300, 80]), 'each note: added, cut, brought in, taken out');
	eq(p.days[0].s.length, 2, 'two sittings: thirty-one idle minutes ended the first');
	eq(p.days[0].h['21'], 21, 'words added in the hour they were');
	eq(p.days[0].h['22'], 1, 'and in the next');
	eq(p.days[0].tot?.w, 5000, 'the stamped total');
	eq(p.events.length, 1, 'an event line');
	ok(p.days[0].m >= 5 && p.days[0].m <= 8, 'active minutes: the minutes something was typed in: ' + p.days[0].m);
	// read back into a ledger and written again: the same file
	const again = new Ledger(A, 2026, p);
	eq(again.serialize(), text, 'read and written again, it is the same file');
	again.typed(t(2026, 10, 10, 22, 30), 'Part One/Arrival', 4, 0);
	eq(again.net('2026-10-10', ''), 19 + 4, 'and carries on from it');
}

// ---- reading a damaged or hand-edited file ----
{
	const l = new Ledger(A, 2026);
	l.typed(t(2026, 3, 1), 'One', 10, 0);
	l.typed(t(2026, 3, 2), 'One', 20, 0);
	const good = l.serialize();
	const cut = good.slice(0, good.length - 15);
	const p = parseFile(cut);
	eq(p.days.length, 1, 'cut short in its last line: the lines before it are read');
	eq(p.skipped, 1, 'and the broken one is counted as skipped');
	const junk = parseFile(good.replace('\n{', '\nnot json at all\n\n{"t":"day","d":"bad"}\n{"t":"day","d":"2026-03-05","n":{"x":[1,2]},"h":{"99":4}}\n{'));
	eq(junk.days.map((d) => d.d).sort().join(), '2026-03-01,2026-03-02,2026-03-05', 'a line that is not JSON, an empty one and one with a bad day are passed over; one with bad parts is kept without them');
	const odd = junk.days.find((d) => d.d === '2026-03-05');
	eq(Object.keys(odd?.n ?? { x: 1 }).length, 0, 'a note with a count that is not four numbers is dropped');
	eq(Object.keys(odd?.h ?? { x: 1 }).length, 0, 'and an hour that is not one');
	ok(!junk.newer, 'it is not a newer format');
	const noHead = parseFile(good.split('\n').slice(1).join('\n'));
	eq(noHead.days.length, 2, 'a file with no first line is read');
	eq(noHead.header, null, 'and has no header');
	eq(parseFile('').days.length, 0, 'an empty file');
	eq(parseFile('\u{feff}' + good).days.length, 2, 'a file with a byte-order mark');
	eq(parseFile(good.replace(/\n/g, '\r\n')).days.length, 2, 'and with Windows line ends');
}

// ---- a newer format: read as far as it is understood, and never written ----
{
	const newer = [
		JSON.stringify({ 'binders-history': FORMAT + 1, device: 'zz99', label: 'Future', kind: 'desktop', year: 2026 }),
		JSON.stringify({ t: 'day', d: '2026-05-05', u: 1, n: { A: [4, 1, 0, 0] }, h: {}, s: [], m: 1, extra: 'from the future' }),
		JSON.stringify({ t: 'tomorrow', what: 'something else' }),
	].join('\n') + '\n';
	const p = parseFile(newer);
	ok(p.newer, 'a newer format is known as one');
	eq(p.days.length, 1, 'its day line is read as far as it is understood');
	const l = new Ledger({ id: 'zz99', label: 'Future', kind: 'desktop' }, 2026, p);
	ok(l.locked, 'a ledger over it will not be written');
	l.typed(t(2026, 5, 5), 'A', 1, 0);
	ok(!l.dirty, 'and is never made dirty');
}

// ---- a line Binders doesn't know is kept ----
{
	const text = new Ledger(A, 2026).serialize() + JSON.stringify({ t: 'note', says: 'the writer’s own line' }) + '\n';
	const l = new Ledger(A, 2026, parseFile(text));
	l.typed(t(2026, 4, 4), 'One', 1, 0);
	ok(l.serialize().includes('the writer’s own line'), 'a line of a kind Binders doesn’t know stays when the file is written again');
}

// ---- merging devices ----
const file = (d: Device, f: (l: Ledger) => void, year = 2026): Source => { const l = new Ledger(d, year); f(l); return { device: d.id, file: parseFile(l.serialize()) }; };
{
	// the same day on two devices: added together
	const phone = dev('p001', 'phone');
	const m = merge([
		file(A, (l) => { l.typed(t(2026, 10, 10, 9), 'One', 100, 10); l.typed(t(2026, 10, 10, 9, 1), 'Two', 5, 0); l.stamp(t(2026, 10, 10, 20), { w: 1000, n: 5, st: { draft: 1000 } }); }),
		file(phone, (l) => { l.typed(t(2026, 10, 10, 13), 'One', 30, 0); l.stamp(t(2026, 10, 10, 13, 30), { w: 900, n: 5, st: { draft: 900 } }); }),
	]);
	const d = m.days[0];
	eq(m.days.length, 1, 'one day');
	eq(JSON.stringify(d.notes.One), JSON.stringify([130, 10, 0, 0]), 'a note’s typing on both devices added together');
	eq(d.added, 135, 'the day’s words added');
	eq(d.cut, 10, 'and cut');
	eq(d.phone, 30, 'what was added on the phone');
	eq(d.total, 1000, 'the day’s total is the one stamped last');
	eq(d.scenes, 5, 'with its scenes');
	eq(m.devices.length, 2, 'two devices are known');
	// the history the window reads
	const h = toHistory(m);
	eq(h.days[0].phone, 30, 'in the model: words on a phone');
	eq(h.days[0].status.draft, 1000, 'and the words by status');
}
{
	// the total is the last stamped, by the time stamped; a device that stamped a stale total is the last, and the next day puts it right
	const m = merge([
		file(A, (l) => {
			l.typed(t(2026, 10, 10, 9), 'One', 100, 0); l.stamp(t(2026, 10, 10, 10), { w: 1100, n: 3, st: {} });
			l.typed(t(2026, 10, 11, 9), 'One', 50, 0); l.stamp(t(2026, 10, 11, 10), { w: 1650, n: 3, st: {} });
		}),
		file(dev('b002'), (l) => { l.typed(t(2026, 10, 10, 15), 'Two', 10, 0); l.stamp(t(2026, 10, 10, 16), { w: 1010, n: 3, st: {} }); }),
	]);
	eq(m.days[0].total, 1010, 'the later stamp wins, though it is the stale one');
	eq(m.days[1].total, 1650, 'and the next day’s stamp is the truth again');
	// the difference between the totals and what was logged is "changed elsewhere"
	eq(m.days[1].elsewhere, 1650 - 1010 - 50, 'what changed elsewhere is the difference: the stale day gives back on the next');
	eq(m.days[0].elsewhere, null, 'the first day has nothing before it to be told from');
}
{
	// a day crossing four in the morning is two days; clocks that disagree put each device’s lines where its own clock does
	const m = merge([
		file(A, (l) => { l.typed(t(2026, 10, 11, 3, 30), 'One', 10, 0); l.typed(t(2026, 10, 11, 4, 10), 'One', 20, 0); }),
		file(dev('c003'), (l) => { l.typed(t(2026, 10, 10, 23, 59), 'One', 7, 0); }),
	]);
	eq(m.days.map((d) => d.day).join(), '2026-10-10,2026-10-11', 'half past three belongs to the day before, ten past four to the next');
	eq(m.days[0].added, 17, 'both devices’ words in the first');
	eq(m.days[1].added, 20, 'and the second');
}
{
	// three devices, a year’s turn: reading the files of both years
	const m = merge([
		file(A, (l) => l.typed(t(2025, 12, 31, 23), 'One', 5, 0), 2025),
		file(A, (l) => l.typed(t(2026, 1, 1, 10), 'One', 6, 0), 2026),
		file(dev('b002'), (l) => l.typed(t(2026, 1, 1, 11), 'One', 7, 0)),
		file(dev('c003', 'tablet'), (l) => l.typed(t(2025, 12, 31, 22), 'Two', 8, 0), 2025),
	]);
	eq(m.days.map((d) => d.day).join(), '2025-12-31,2026-01-01', 'the days of two years, oldest first');
	eq(m.days[0].added, 13, 'the old year’s devices added');
	eq(m.days[1].added, 13, 'the new year’s');
	eq(m.devices.length, 3, 'three devices');
	eq(m.days[0].phone, 8, 'a tablet’s words are a phone’s');
}
{
	// the same device’s day twice (a copy Sync made): the later one by its update time wins
	const l1 = new Ledger(A, 2026); l1.typed(t(2026, 6, 1, 9), 'One', 10, 0);
	const early = l1.serialize();
	const l2 = new Ledger(A, 2026, parseFile(early)); l2.typed(t(2026, 6, 1, 10), 'One', 15, 0);
	const late = l2.serialize();
	const m = merge([{ device: 'a1b2', file: parseFile(late) }, { device: 'a1b2', file: parseFile(early) }]);
	eq(m.days.length, 1, 'one day');
	eq(m.days[0].added, 25, 'the copy last written wins, and the stale one is not added');
	eq(m.devices.length, 1, 'one device');
}

// ---- renames are followed ----
{
	const m = merge([
		file(A, (l) => {
			l.typed(t(2026, 10, 1), 'Part One/Arrival', 10, 0);
			l.event({ at: t(2026, 10, 2), k: 'renamed', from: 'Part One/Arrival', to: 'Part One/Landing' });
			l.typed(t(2026, 10, 3), 'Part One/Landing', 5, 0);
			l.event({ at: t(2026, 10, 4), k: 'moved', from: 'Part One/Landing', to: 'Part Two/Landing' });
			l.typed(t(2026, 10, 5), 'Part Two/Landing', 1, 0);
			l.typed(t(2026, 10, 6), 'Part Two/Other', 2, 0);
			l.event({ at: t(2026, 10, 7), k: 'renamed', from: 'Part Two', to: 'Middle', folder: 1 });
		}),
	]);
	const keys = new Set(m.days.flatMap((d) => Object.keys(d.notes)));
	eq([...keys].sort().join('|'), 'Middle/Landing|Middle/Other', 'every day of a scene is under the name it has now, and a folder’s rename takes what is in it');
	eq(m.days[0].notes['Middle/Landing'][0], 10, 'the first day follows');
}
{
	// clocks that disagree: B’s rename of the new name is stamped before A’s rename; the chain is still followed
	const m = merge([
		file(A, (l) => { l.typed(t(2026, 10, 1), 'x', 3, 0); l.event({ at: t(2026, 10, 3, 12), k: 'renamed', from: 'x', to: 'y' }); }),
		file(dev('b002'), (l) => { l.event({ at: t(2026, 10, 3, 11), k: 'renamed', from: 'y', to: 'z' }); }),
	]);
	eq(Object.keys(m.days[0].notes).join(), 'z', 'a chain of renames is followed whichever clock says first');
	// a name used again after the rename is another note
	const n = merge([
		file(A, (l) => {
			l.typed(t(2026, 10, 1), 'x', 3, 0);
			l.event({ at: t(2026, 10, 2), k: 'renamed', from: 'x', to: 'y' });
			l.typed(t(2026, 10, 5), 'x', 4, 0);
		}),
	]);
	eq(Object.keys(n.days[0].notes).join() + '|' + Object.keys(n.days[1].notes).join(), 'y|x', 'a name used again after it was renamed away is a new note');
	// a rename cycle doesn't hang
	const c = merge([file(A, (l) => { l.typed(t(2026, 10, 1), 'p', 1, 0); l.event({ at: t(2026, 10, 2), k: 'renamed', from: 'p', to: 'q' }); l.event({ at: t(2026, 10, 3), k: 'renamed', from: 'q', to: 'p' }); })]);
	eq(c.days.length, 1, 'renamed away and back is not a loop');
}

// ---- status and label on any date ----
{
	const m = merge([
		file(A, (l) => {
			l.event({ at: t(2026, 10, 1), k: 'made', p: 'One' });
			l.event({ at: t(2026, 10, 3), k: 'status', p: 'One', from: '', to: 'draft' });
			l.event({ at: t(2026, 10, 9), k: 'status', p: 'One', from: 'draft', to: 'done' });
			l.event({ at: t(2026, 10, 9), k: 'renamed', from: 'One', to: 'Uno' });
		}),
	]);
	eq(statusOn(m, 'Uno', '2026-10-02'), '', 'before it was set');
	eq(statusOn(m, 'Uno', '2026-10-05'), 'draft', 'between');
	eq(statusOn(m, 'Uno', '2026-10-20'), 'done', 'after, under the name it has now');
	eq(statusOn(m, 'Nothing', '2026-10-20'), '', 'a scene with no history');
}

// ---- events come out as marks and counts ----
{
	const m = merge([
		file(A, (l) => {
			l.typed(t(2026, 10, 1, 9), 'One', 5, 0);
			l.event({ at: t(2026, 10, 1, 10), k: 'order', p: '' });
			l.event({ at: t(2026, 10, 1, 10, 5), k: 'order', p: '' });
			l.event({ at: t(2026, 10, 1, 11), k: 'snapshot', p: '', name: 'Before the rewrite' });
			l.event({ at: t(2026, 10, 1, 12), k: 'export', name: 'docx' });
			l.event({ at: t(2026, 10, 1, 13), k: 'import', n: 12, w: 4000 });
		}),
	]);
	const h = toHistory(m);
	eq(h.days[0].moves, 2, 'the times the order changed');
	eq(h.marks.map((x) => `${x.kind}:${x.what}`).join('|'), 'snapshot:Before the rewrite|export:docx|import:12 notes', 'a named snapshot, an export and an import are marks on the chart');
}

// ---- sittings from two devices that overlap are one stretch of the day ----
{
	const m = merge([
		file(A, (l) => { l.typed(t(2026, 10, 1, 9, 0), 'One', 1, 0); l.typed(t(2026, 10, 1, 9, 20), 'One', 1, 0); }),
		file(dev('b002'), (l) => { l.typed(t(2026, 10, 1, 9, 10), 'Two', 1, 0); l.typed(t(2026, 10, 1, 14, 0), 'Two', 1, 0); }),
	]);
	eq(m.days[0].sittings.length, 2, 'overlapping sittings join, a separate one stays');
}

// ---- what Sync delivers is not recorded twice ----
{
	const m = merge([
		file(A, (l) => { l.event({ at: t(2026, 10, 1, 9), k: 'made', p: 'One' }); l.event({ at: t(2026, 10, 1, 9, 5), k: 'snapshot', p: '', name: 'Draft' }); }),
		file(dev('b002'), (l) => { l.event({ at: t(2026, 10, 1, 9, 40), k: 'made', p: 'One' }); l.event({ at: t(2026, 10, 1, 9, 6), k: 'snapshot', p: '', name: 'Draft' }); }),
	]);
	eq(m.events.filter((e) => e.k === 'made').length, 1, 'a note made on one device and arriving on another is one made');
	eq(m.events.filter((e) => e.k === 'snapshot').length, 2, 'a snapshot is each device’s own act');
}

// ---- words counted before the file is read are added to it ----
{
	const old = new Ledger(A, 2026); old.typed(t(2026, 5, 1, 9), 'One', 10, 1); old.event({ at: t(2026, 5, 1, 9), k: 'made', p: 'One' });
	const file1 = parseFile(old.serialize());
	const live = new Ledger(A, 2026);
	live.typed(t(2026, 5, 1, 10), 'One', 5, 0);
	live.absorb(file1);
	eq(JSON.stringify(live.get('2026-05-01')?.n.One), JSON.stringify([15, 1, 0, 0]), 'typing before the read and the file’s day are added');
	eq(live.lines().events.length, 1, 'with its events');
	live.absorb(file1, true);
	eq(JSON.stringify(live.get('2026-05-01')?.n.One), JSON.stringify([15, 1, 0, 0]), 'a copy of the same file is not added in again');
	const newer = parseFile(JSON.stringify({ 'binders-history': 9, device: 'a1b2', label: 'x', kind: 'desktop', year: 2026 }) + '\n');
	const l2 = new Ledger(A, 2026); l2.typed(t(2026, 5, 1), 'One', 1, 0); l2.absorb(newer);
	ok(l2.locked && !l2.dirty, 'a newer file read late locks the ledger and nothing is written');
}

done('progress record');
