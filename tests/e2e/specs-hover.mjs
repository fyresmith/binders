// The driver's pointer: with `hover`, headless Obsidian has a desktop's mouse (it hovers, it's fine), touch emulation
// swaps it for a finger and gives it back, and `p.hover` and `p.tooltip` read what hovering shows. These start their
// own Obsidian, as specs-driver.mjs does, so they test the option whatever the run was started with.
import { launch } from './driver.mjs';

const MEDIA = `['(hover: hover)', '(any-hover: hover)', '(pointer: fine)', '(any-pointer: fine)', '(hover: none)', '(pointer: coarse)'].filter(q => matchMedia(q).matches).join(' ')`;
const BUTTON = '.workspace-leaf.mod-active .binders-toolbar-button';
const openBinder = (s) => s.ev(`(async () => { const pl = app.plugins.plugins.binders; await pl.binders.ready; await pl.openBinder(app.vault.getAbstractFileByPath('The Lighthouse')); })().then(() => 1)`).then(() => s.sleep(600));
const mobile = async (s, on) => {
	await s.send('Emulation.setDeviceMetricsOverride', on ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: false });
	await s.ev(`(() => { setTimeout(() => app.emulateMobile(${on}), 50); return 1; })()`);
	await s.sleep(1500);
	for (let i = 0; i < 80 && !(await s.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders && app.isMobile === ${on})`).catch(() => false)); i++) await s.sleep(250);
};

export const specs = [{
	name: 'driver: with hover, the page has a mouse that hovers; touch emulation makes it a finger and gives the mouse back; a phone is touch',
	async fn(_p, _h, t) {
		const s = await launch({ hover: true });
		try {
			t.eq(await s.pointer(), 'mouse', 'a desktop has a mouse');
			t.eq(await s.ev(MEDIA), '(hover: hover) (any-hover: hover) (pointer: fine) (any-pointer: fine)', 'it hovers and it is fine');
			await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
			t.eq(await s.pointer(), 'touch', 'touch emulation: a finger');
			t.eq(await s.ev(MEDIA), '(hover: none) (pointer: coarse)', 'which neither hovers nor is fine');
			await s.send('Emulation.setTouchEmulationEnabled', { enabled: false });
			t.eq(await s.pointer(), 'mouse', 'and the mouse is back when it is turned off');
			// Obsidian's mobile mode reloads the window: the mouse survives that, and a phone test's touch emulation takes it away
			await mobile(s, true);
			await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
			t.eq(await s.pointer(), 'touch', 'a phone: a finger');
			await s.send('Emulation.setTouchEmulationEnabled', { enabled: false });
			await mobile(s, false);
			t.eq(await s.pointer(), 'mouse', 'back on the desktop: a mouse');
		} finally { await s.close(); }
	},
}, {
	name: 'driver: hover() rests the pointer on an element and returns its tooltip; rules behind (hover: hover) apply',
	async fn(_p, _h, t) {
		const s = await launch({ hover: true });
		try {
			await s.focusMain();
			const label = await s.ev(`document.querySelector('.side-dock-ribbon-action').getAttribute('aria-label')`);
			t.eq(await s.hover('.side-dock-ribbon-action'), label, 'the ribbon button’s tooltip is its name');
			t.eq(await s.tooltip(), label, 'tooltip() reads the one showing');
			t.eq(await s.hover('.side-dock-ribbon-action'), label, 'hovering it again, from inside, shows it again');
			await openBinder(s);
			await s.move(s.width / 2, s.height - 40);
			await s.sleep(300);
			t.eq(await s.tooltip(), null, 'the tooltip goes when the pointer leaves');
			// Binders' own hover rules are all inside @media (hover: hover): a toolbar button tints under the pointer
			const tint = () => s.ev(`getComputedStyle(document.querySelector(${JSON.stringify(BUTTON)})).backgroundColor`);
			const before = await tint();
			t.eq(await s.hover(BUTTON, { ms: 400 }), null, 'a toolbar button with its label showing has no tooltip');
			await s.sleep(250);
			t.ok(await s.ev(`document.querySelector(${JSON.stringify(BUTTON)}).matches(':hover')`), 'the button is under the pointer');
			t.ok(await tint() !== before, `the button tints under the pointer (it stayed ${before})`);
		} finally { await s.close(); }
	},
}, {
	name: 'driver: without hover, headless Obsidian has no pointer at all',
	async fn(_p, _h, t) {
		const s = await launch({ hover: false });
		try {
			t.eq(await s.pointer(), 'none', 'no mouse, no finger');
			t.eq(await s.ev(MEDIA), '(hover: none)', 'so nothing behind (hover: hover) applies');
		} finally { await s.close(); }
	},
}];
