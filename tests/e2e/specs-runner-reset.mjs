// The runner's own reset (tests/e2e/run.mjs): the vault between two tests is exactly the pristine test-vault. The first
// test leaves what tests have left (a picture in a binder folder, one at the vault's root, a Snapshots/History folder);
// the second, run right after it in the same Obsidian, finds none of it. (Run in this order: --grep "runner reset".)
export const specs = [
	{ name: 'runner reset: a test leaves pictures and a record folder behind', fn: async (p) => {
		await p.ev(`(async () => { const b = new Uint8Array([1, 2, 3]).buffer; await app.vault.createBinary('The Lighthouse/Part One/map.png', b); await app.vault.createBinary('stray.pdf', b); await app.vault.createFolder('The Lighthouse/Snapshots'); await app.vault.createFolder('The Lighthouse/Snapshots/History'); await app.vault.create('The Lighthouse/Snapshots/History/x.txt', 'hi'); })().then(() => 1)`);
	} },
	{ name: 'runner reset: the next test starts from the pristine vault, whatever the extension', fn: async (p, h, t) => {
		const all = await p.ev(`app.vault.getAllLoadedFiles().map(f => f.path).sort()`);
		const left = all.filter((x) => /map\.png|stray|Snapshots/.test(x));
		t.ok(left.length === 0, 'left over from the test before: ' + left.join(', '));
		t.ok(all.includes('The Lighthouse/Part One') && all.includes('The Lighthouse/The Lighthouse.md'), 'the fixture’s folders and notes are all there');
	} },
];
