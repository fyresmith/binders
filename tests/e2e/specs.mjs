// Smoke tests. Add a specs-<area>.mjs file per area as features land; each exports `specs`.
export const specs = [];
const test = (name, fn) => specs.push({ name, fn });

test('the plugin loads without errors', async (p, h, t) => {
	t.ok(await p.ev(`!!app.plugins.plugins.binders`), 'Binders is enabled');
});

test('plugin settings tab: drawn from definitions (Obsidian 1.13+), toggles save', async (p, h, t) => {
	await p.ev(`(() => { app.setting.open(); return 1; })()`); await p.sleep(1000);
	await p.ev(`(() => { app.setting.openTabById('binders'); return 1; })()`); await p.sleep(600);
	const C = `app.setting.activeTab.containerEl`;
	try {
		const txt = await p.ev(`${C}.innerText`);
		t.ok(/Order binders in the file explorer/.test(txt) && /Open binders from the file explorer/.test(txt), 'every setting shown');
		await p.ev(`(() => { ${C}.querySelector('.checkbox-container').click(); return 1; })()`); await p.sleep(400);
		t.eq(await p.ev(`app.plugins.plugins.binders.settings.orderExplorer`), false, 'the first toggle saves');
	} finally { await p.ev(`(() => { app.setting.close(); return 1; })()`); }
});

test('settings: each label’s color well has a name that says whose color it is, and follows the label’s new name', async (p, h, t) => {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await p.sleep(900);
	try {
		const wells = () => p.ev(`[...app.setting.activeTab.containerEl.querySelectorAll('.binders-settings-label')].map(r => [r.querySelector('input[type="text"]')?.value, r.querySelector('input[type="color"]')?.getAttribute('aria-label')])`);
		const all = await wells();
		t.ok(all.length >= 8, 'a row per label: ' + all.length);
		t.eq(JSON.stringify(all.filter(([name, label]) => label !== 'Custom color for ' + name)), '[]', 'each well is named for its label');
		await p.ev(`(() => { const i = app.setting.activeTab.containerEl.querySelector('.binders-settings-label input[type="text"]'); i.focus(); i.value = 'Crimson'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1; })()`);
		await p.sleep(400);
		t.eq((await wells())[0][1], 'Custom color for Crimson', 'renamed: the well’s name follows');
	} finally { await p.ev(`(() => { app.setting.close(); return 1; })()`); }
});
