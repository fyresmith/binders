// A binder whose note is gone from the vault has no folder any more (a deleted file has no parent), and a change that
// was waiting for its write can still ask what the binder holds: it holds nothing, and nothing is written (it was a
// TypeError in the store's folder walk, seen once during an export of an example binder that was being removed).
import { B, j, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'binder gone: ' + name, fn: withTidy(fn) });

test('a binder whose note is deleted holds nothing, and asking does not throw', async (p, h, t) => {
	const r = await p.ev(`(async () => {
		const b = ${B}, note = app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md'), s = b.states.get(note);
		if (!s) return { error: 'no state for the binder note' };
		const out = {};
		await app.vault.delete(note);
		s.items = null; s.contents = null;
		try { out.items = b.items(s).size; out.known = b.known(s).length; out.contents = b.contents(s).length; await b.write(s); out.ok = true; } catch (e) { out.error = String(e); }
		return out;
	})()`);
	t.ok(!r.error, 'no exception: ' + j(r));
	t.eq(j([r.items, r.known]), j([0, 0]), 'it holds nothing');
	t.ok(!(await p.ev(`app.vault.adapter.exists('The Lighthouse/The Lighthouse.md')`)), 'and nothing is written back');
});
