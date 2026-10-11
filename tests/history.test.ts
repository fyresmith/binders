import type { TFile, TFolder } from 'obsidian';
import { History } from '../src/history/history';
import type { Entry, Handlers, Step } from '../src/history/types';
import { sameValue } from '../src/history/values';
import { UnsupportedBinder } from '../src/model';
import { done, eq, ok } from './harness';

// The history's own rules, with handlers that touch nothing: stacks, limits, the order steps run in, check then apply,
// and a refusal that is said once and given up on the second ask.

const note = (path: string) => ({ path }) as unknown as TFile;
const binderA = { note: note('A/A.md'), folder: { path: 'A' } as unknown as TFolder, problem: null as string | null };
const binderB = { note: note('B/B.md'), folder: { path: 'B' } as unknown as TFolder, problem: null as string | null };
const all = [binderA, binderB];
const scope = { binderOf: (item: unknown) => all.find((b) => item === b.folder || (typeof item === 'string' && item.startsWith(b.folder.path))) ?? null, all: () => all };

/** A history whose steps are `{ kind: 'props', changes: [] }` stand-ins with a name in `what`, and whose handlers log. */
function make(opts: { dead?: Set<string>; refuse?: Set<string> } = {}) {
	const log: string[] = [];
	const nameOf = (s: Step) => ((s as { what?: Record<string, string> }).what ?? {}).n;
	const handler = (kind: string) => ({
		alive: (s: Step) => !opts.dead?.has(nameOf(s)),
		check: async (s: Step, redo: boolean) => { log.push(`check ${nameOf(s)} ${redo ? 'redo' : 'undo'}`); if (opts.refuse?.has(nameOf(s))) throw new Error(`no ${nameOf(s)}`); return nameOf(s); },
		apply: async (s: Step, redo: boolean, plan: unknown) => { log.push(`apply ${nameOf(s)} ${redo ? 'redo' : 'undo'} plan=${String(plan)}`); },
	});
	const h = new History(scope);
	h.handlers = { order: handler('order'), props: handler('props') } as unknown as Handlers;
	const step = (n: string): Step => ({ kind: 'props', changes: [], what: { n } });
	return { h, log, step };
}

async function main(): Promise<void> {
// recording
{
	const { h, step } = make();
	let changed = 0;
	h.onChange = () => { changed++; };
	h.record({ note: binderA.note, label: 'One', steps: [step('a')] });
	h.record({ note: binderA.note, label: 'Two', steps: [step('b')] });
	eq(h.undos.length, 2, 'two entries');
	eq(changed, 2, 'each change is announced');
	eq(h.undoable(binderA.folder), 'Two', 'the newest is what would be undone');
	eq(h.undoable(binderB.folder), null, 'another binder has none of them');
	eq(h.undoable(binderA.folder, true), null, 'and nothing to redo');
}

// undo and redo: one binder's entries only, newest first; the redo is emptied by the next change
{
	const { h, step } = make();
	h.record({ note: binderA.note, label: 'A one', steps: [step('a1')] });
	h.record({ note: binderB.note, label: 'B one', steps: [step('b1')] });
	h.record({ note: binderA.note, label: 'A two', steps: [step('a2')] });
	eq(await h.undo(binderA.folder), 'A two', 'undoes the binder’s newest');
	eq(h.undoable(binderA.folder, true), 'A two', 'which can be made again');
	eq(h.undoable(binderB.folder), 'B one', 'the other binder is where it was');
	eq(await h.undo(binderA.folder, true), 'A two', 'redo');
	eq(h.redos.length, 0, 'nothing left to redo');
	await h.undo(binderA.folder);
	h.record({ note: binderA.note, label: 'A three', steps: [step('a3')] });
	eq(h.redos.length, 0, 'a new change empties the redo');
	eq(await h.undo(note('X') as never), null, 'an item in no binder has nothing');
	eq(h.lastChanged()?.path, 'A', 'the binder changed last');
	eq(await h.undo(binderB.folder), 'B one', 'the other binder’s own');
	eq(h.lastChanged(true)?.path, 'B', 'the binder taken back last');
}

// steps: taken back in reverse, made again in order; every check before any apply
{
	const { h, log, step } = make();
	h.record({ note: binderA.note, label: 'Two steps', steps: [step('x'), step('y')] });
	await h.undo(binderA.folder);
	eq(log.join(' | '), 'check y undo | check x undo | apply y undo plan=y | apply x undo plan=x', 'undo: reverse, all checks first, each plan handed on');
	log.length = 0;
	await h.undo(binderA.folder, true);
	eq(log.join(' | '), 'check x redo | check y redo | apply x redo plan=x | apply y redo plan=y', 'redo: forward');
}

// check then apply: one step that can't go, and nothing is applied
{
	const { h, log, step } = make({ refuse: new Set(['y']) });
	h.record({ note: binderA.note, label: 'Stuck', steps: [step('x'), step('y')] });
	let said = '';
	try { await h.undo(binderA.folder); } catch (e) { said = (e as Error).message; }
	eq(said, 'no y', 'the refusal is the handler’s sentence');
	ok(!log.some((l) => l.startsWith('apply')), 'nothing applied');
	eq(h.undos.length, 1, 'the entry stays');
	ok(h.undos[0].failed === true, 'marked as said once');
	// asked again unchanged: given up, and there is nothing before it
	eq(await h.undo(binderA.folder), null, 'asked again it is dropped');
	eq(h.undos.length, 0, 'gone');
	eq(h.redos.length, 0, 'and not made to be redone');
}

// the two-strike rule takes the entry before it
{
	const { h, step } = make({ refuse: new Set(['bad']) });
	h.record({ note: binderA.note, label: 'Good', steps: [step('ok')] });
	h.record({ note: binderA.note, label: 'Bad', steps: [step('bad')] });
	try { await h.undo(binderA.folder); } catch { /* said once */ }
	eq(await h.undo(binderA.folder), 'Good', 'the second ask takes the one before');
	eq(h.undos.length, 0, 'the refused one is gone');
}

// a refusal that is put right is tried again and goes through
{
	const refuse = new Set(['p']);
	const { h, step } = make({ refuse });
	h.record({ note: binderA.note, label: 'Waits', steps: [step('p')] });
	try { await h.undo(binderA.folder); } catch { /* said once */ }
	refuse.delete('p');
	eq(await h.undo(binderA.folder), 'Waits', 'once what was in the way is put right');
	ok(!h.redos[0].failed, 'and it is no longer marked');
}

// steps with nothing there are passed over, and an entry with none is dropped
{
	const dead = new Set(['gone']);
	const { h, log, step } = make({ dead });
	h.record({ note: binderA.note, label: 'Before', steps: [step('live')] });
	h.record({ note: binderA.note, label: 'Half', steps: [step('live2'), step('gone')] });
	h.record({ note: binderA.note, label: 'All gone', steps: [step('gone')] });
	eq(h.undoable(binderA.folder), 'Half', 'an entry with nothing there is not offered');
	await h.undo(binderA.folder);
	ok(!log.some((l) => l.includes('gone')), 'the dead step is never looked at');
	eq(h.undos.length, 1, 'the dead entry went with it');
}

// a binder in a newer format refuses
{
	const { h, step } = make();
	h.record({ note: binderB.note, label: 'Newer', steps: [step('n')] });
	binderB.problem = 'Made by a newer version.';
	let err: unknown = null;
	try { await h.undo(binderB.folder); } catch (e) { err = e; }
	ok(err instanceof UnsupportedBinder, 'it says why');
	eq(h.undos.length, 1, 'and keeps the entry');
	binderB.problem = null;
}

// limits: per binder, and in bytes; the oldest go first
{
	const { h, step } = make();
	h.limits.entries = 5;
	for (let i = 0; i < 4; i++) h.record({ note: binderB.note, label: `B${i}`, steps: [step('b')] });
	for (let i = 0; i < 8; i++) h.record({ note: binderA.note, label: `A${i}`, steps: [step('a')] });
	eq(h.undos.filter((e) => e.note === binderA.note).length, 5, 'five of a binder’s');
	eq(h.undos.filter((e) => e.note === binderB.note).length, 4, 'another binder’s are not crowded out');
	eq(h.undos.filter((e) => e.note === binderA.note)[0].label, 'A3', 'the oldest went');
}
{
	const { h, step } = make();
	h.limits.bytes = 100;
	const e1 = h.record({ note: binderA.note, label: 'big 1', steps: [step('a')], bytes: 60 });
	h.record({ note: binderA.note, label: 'small', steps: [step('a')] });
	h.record({ note: binderA.note, label: 'big 2', steps: [step('a')], bytes: 60 });
	ok(!h.undos.includes(e1 as Entry), 'the oldest that holds bytes is dropped over the limit');
	eq(h.undos.map((e) => e.label).join(','), 'small,big 2', 'the entry that holds none stays');
	h.record({ note: binderA.note, label: 'huge', steps: [step('a')], bytes: 500 });
	eq(h.undos[h.undos.length - 1].label, 'huge', 'the newest stays, whatever its size');
	eq(h.undos.filter((e) => e.bytes).length, 1, 'but nothing else that holds bytes does');
}

// asked twice at once: one after the other; and an undo waits for what is being done and not yet recorded
{
	const { h, step } = make();
	h.record({ note: binderA.note, label: 'A one', steps: [step('a1')] });
	h.record({ note: binderA.note, label: 'A two', steps: [step('a2')] });
	const both = await Promise.all([h.undo(binderA.folder), h.undo(binderA.folder)]);
	eq(both.join(','), 'A two,A one', 'two at once take one each, newest first');
	let release: () => void = () => {};
	const slow = new Promise<void>((r) => { release = r; });
	void h.track(slow.then(() => { h.record({ note: binderA.note, label: 'late', steps: [step('l')] }); }));
	const asked = h.undo(binderA.folder);
	release();
	eq(await asked, 'late', 'it waits for the change under way, and takes that one');
	void h.track(Promise.reject(new Error('a write that failed')).catch(() => {}));
	eq(await h.undo(binderA.folder), null, 'a change that failed does not hold it up');
}

// forgetting a binder
{
	const { h, step } = make();
	h.record({ note: binderA.note, label: 'A', steps: [step('a')] });
	h.record({ note: binderB.note, label: 'B', steps: [step('b')] });
	await h.undo(binderA.folder);
	h.forget(binderA.note);
	eq(h.undos.length, 1, 'one binder’s forgotten');
	eq(h.redos.length, 0, 'with what it could redo');
}

// values as written
ok(sameValue(undefined, null), 'none and null are alike');
ok(sameValue(['a', 'b'], ['a', 'b']), 'a list by what is in it');
ok(!sameValue(['a'], ['a', 'b']), 'lists that differ');
ok(!sameValue('a', 'A'), 'case counts');

done('history');
}

void main();
