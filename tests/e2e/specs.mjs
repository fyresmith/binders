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
