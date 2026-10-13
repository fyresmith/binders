// The direction: when each thing in the take happens, to the hundredth of a second, and from that everything the
// film draws that the take does not hold: where the pointer is and how it gets there, which picture of the app is
// on screen, each key's moment, where the camera is, and every sound. Plain JavaScript, so that `node check.mjs` can
// read the same cut the film does and say where a hand could not keep up.
//
// The track: 80 beats a minute from 0.73; its strong hits at 0.73, 2.23, 5.23, 6.73, 8.23, 9.73, 14.23, 15.73, 17.23,
// 20.23, 21.73, 26.23, 27.73, 29.23, 32.23, 33.73, 38.23, 39.73, 41.23, 44.23, 45.73; its last note struck at 47.9 and
// gone by 49.3. What changes the picture most goes on a strong hit; a click that only opens something follows the hand.

export const LENGTH = 49.3, FPS = 60;
export const PHONE = { in: 27.73, out: 34.6, deskBack: 34.85 }, WALL = 41.33, NAME = 44.23;

/** The cut. `a` names a thing done in the take; `at` is the moment of the press (or first key, or first turn of the
    wheel); `to` is a drag's release, `end` a typed line's last key, `dur` a scroll's length. `pop`: a menu opens. */
export const CUES = [
	{ a: 'folder-menu', at: 1.48, pop: true },
	{ a: 'make-binder', at: 2.23 },
	{ a: 'prologue-up', at: 3.2, to: 4.48 },
	{ a: 'open-part-two', at: 5.23 },
	{ a: 'wreck-first', at: 6.73, to: 8.23 },
	{ a: 'mode-1', at: 9.08, pop: true },
	{ a: 'manuscript', at: 9.73 },
	{ a: 'title-menu-1', at: 10.6, pop: true },
	{ a: 'snapshots-1', at: 11.41, pop: true },
	{ a: 'take-snapshot', at: 12.23 },
	{ a: 'select-line', at: 13.35, ibeam: true },
	{ a: 'rewrite', at: 13.88, end: 17.23 },
	{ a: 'title-menu-2', at: 18.3, pop: true },
	{ a: 'snapshots-2', at: 19.1, pop: true },
	{ a: 'show-snapshots', at: 19.9 },
	{ a: 'show-changes', at: 20.98 },
	{ a: 'close-snapshots', at: 23.4 },
	{ a: 'mode-2', at: 24.73, pop: true },
	{ a: 'outliner', at: 25.48 },
	{ a: 'status-cell', at: 26.4, pop: true },
	{ a: 'revised', at: 27.15 },
	{ a: 'phone-start', at: PHONE.in },
	{ a: 'phone-card', at: 28.35 },
	{ a: 'phone-more', at: 29.23, pop: true },
	{ a: 'phone-add-task', at: 30.2 },
	{ a: 'phone-type', at: 30.62, end: 33.73 },
	{ a: 'phone-enter', at: 34.15 },
	{ a: 'desk-again', at: PHONE.deskBack },
	{ a: 'task', at: 35.75 },
	{ a: 'tick', at: 36.55 },
	{ a: 'more-options', at: 37.33, pop: true },
	{ a: 'export', at: 38.23 },
	{ a: 'paperback', at: 39.1 },
	{ a: 'pages', at: 39.8, dur: 0.65 },
	{ a: 'export-button', at: 41.23 },
];

/** The captions: what the writer gets, never the name of a view. Each is set where the frame is empty beside the
    thing it is about (x, y on the screen; `align` says which edge of it x is). A caption that is one thought comes
    all at once. One that is a thing done and then what it got her has two lines, each a whole sentence, the second
    held back until that happens on screen: "Move a scene." as the card is picked up, "The book follows." as it is
    dropped. A line is never left half said. *Starred* words are underlined as they land: the words that carry it.
    All of a caption's lines leave together at `out`. */
export const CAPTIONS = [
	// the trouble, said whole
	{ x: 1290, y: 500, align: 'left', size: 60, out: 2.35, lines: [[0.4, 'Obsidian sorts'], [0.49, 'your novel *A* *to* *Z.*']] },
	// what she does; then, as the Prologue lands, what it got her
	// (it stays as the camera draws back: by then it is under the cards, on the empty board)
	{ x: 1150, y: 530, align: 'left', size: 60, out: 6.4, lines: [[2.5, 'Make it a binder.'], [4.48, 'Now the order is *yours.*']] },
	{ x: 1180, y: 660, align: 'center', size: 60, out: 9.7, lines: [[6.73, 'Move a scene.'], [8.23, 'The book *follows.*']] },
	{ x: 112, y: 650, align: 'left', size: 60, out: 11.3, lines: [[9.95, 'Separate notes.'], [10.12, '*One* *manuscript.*']] },
	{ x: 112, y: 650, align: 'left', size: 60, out: 12.9, lines: [[11.45, 'Take a'], [11.52, '*snapshot* first.']] },
	{ x: 634, y: 812, align: 'left', size: 56, out: 23.3, lines: [[21.3, 'Rewrite freely.'], [21.73, 'The old draft is *still* *there.*']] },
	{ x: 800, y: 720, align: 'center', size: 56, out: 27.6, lines: [[25.7, 'Know where *every* *scene* stands.']] },
	{ x: 694, y: 400, align: 'right', size: 60, out: 30.2, lines: [[28.0, 'The same binder,'], [28.1, '*on* *your* *phone.*']] },
	{ x: 1066, y: 470, align: 'left', size: 50, out: 37.2, lines: [[35.25, 'Waiting for you'], [35.35, '*at* *your* *desk.*']] },
	// the click on Export...; then, on the click that picks it, what comes out
	{ x: 232, y: 850, align: 'left', size: 44, out: 41.0, lines: [[38.5, 'Export it.'], [39.15, 'A *print-ready*'], [39.22, '*paperback.*']] },
	{ x: 960, y: 540, align: 'center', size: 86, out: 43.95, lines: [[41.8, 'And every word stays'], [41.9, '*plain* *Markdown.*']] },
];

// ---- small things ----
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
/** A number from 0 to 1 that is always the same for the same seed: the film is the same film every render. */
export const rand = (seed) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** How a hand covers a distance: off quickly, a long time arriving. 0 to 1 over 0 to 1. */
const reach = (u) => { const w = Math.pow(clamp(u), 0.8); return 10 * w ** 3 - 15 * w ** 4 + 6 * w ** 5; };
/** How long a hand takes to a target `w` wide, `d` away, in seconds (Fitts). */
const travel = (d, w, finger) => clamp(((finger ? 150 : 120) + 130 * Math.log2(d / Math.max(16, w) + 1)) / 1000, finger ? 0.25 : 0.22, finger ? 0.7 : 0.9);

/** When each key of a typed line lands: a hand's uneven rhythm, fitted between the first key and the last. */
function keyTimes(text, at, end, seed) {
	const gaps = [0];
	for (let i = 1; i < text.length; i++) {
		const ch = text[i], prev = text[i - 1];
		let g = 95 * Math.exp((rand(seed + i) - 0.5) * 0.56);
		if (prev === ' ') g += 45;
		if (ch !== ch.toLowerCase()) g += 80;
		if ('.?!,'.includes(ch)) g += 110;
		if ('.?!'.includes(prev)) g += 330;
		if (ch === prev) g *= 1.25;
		gaps.push(g);
	}
	const total = gaps.reduce((n, g) => n + g, 0);
	let t = at;
	return gaps.map((g) => (t += g / total * (end - at)));
}

/** Everything the film needs, worked out once from the take. */
export function direct(takes) {
	const acts = Object.fromEntries(takes.acts.map((a) => [a.name, a]));
	const cues = CUES.map((c, i) => ({ ...c, i, act: acts[c.a] })).filter((c) => c.act);
	const warnings = [], sounds = [];
	const sound = (t, name, gain = 1, rate = 1) => sounds.push({ t, name, gain, rate });

	// ---- the hand: the pointer at the desk, a finger on the phone ----
	// Each cue the hand has a part in becomes a leg: it leaves where it was, arrives a little before the press, and
	// is busy until `free`.
	const hand = (surface) => {
		const finger = surface === 'phone', legs = [];
		let px = finger ? 250 : 720, py = finger ? 370 : 430, free = finger ? PHONE.in + 0.1 : 0.3;
		for (const c of cues) {
			const a = c.act;
			if (a.surface !== surface) continue;
			if (a.kind === 'still') { if (!finger && c.a === 'desk-again') { px = 900; py = 300; free = c.at + 0.2; } continue; }
			if (a.kind === 'type' || a.kind === 'key') { legs.push({ c, hidden: true, from: c.at, till: (c.end ?? c.at) + 0.25 }); free = (c.end ?? c.at) + 0.3; continue; }
			const d = Math.hypot(a.x - px, a.y - py), need = travel(d, Math.min(a.w || 40, a.h || 40), finger);
			const dwell = c.pop === undefined && /menu|snapshots|manuscript|outliner|revised|make|export$|task$/.test(c.a) ? 0.1 : 0.15;
			const arrive = c.at - dwell;
			let leave = arrive - need;
			if (leave < free) { if (free - leave > 0.06) warnings.push(`${c.a} at ${c.at}: the hand needs ${need.toFixed(2)} s to get there and has ${(arrive - free).toFixed(2)}`); leave = Math.min(free, arrive - 0.12); }
			const side = rand(c.i * 7.3) > 0.5 ? 1 : -1, bow = d < 40 ? 0 : Math.min(40, d * lerp(0.04, 0.08, rand(c.i * 3.1))) * side;
			legs.push({ c, x0: px, y0: py, x1: a.x, y1: a.y, leave, arrive, bow, d });
			px = a.kind === 'drag' ? a.tx : a.x; py = a.kind === 'drag' ? a.ty : a.y;
			free = a.kind === 'drag' ? c.to + 0.25 : a.kind === 'wheel' ? c.at + c.dur : c.at + 0.2; // (it looks at what it did, a moment, before it moves on)
		}
		return legs;
	};
	const deskLegs = hand('desk'), phoneLegs = hand('phone');
	/** How far through a drag the hand is at `t`: a moment's hold, the carry, a pause over the place, then the release. */
	const carried = (c, t) => reach((t - c.at - 0.17) / (c.to - c.at - 0.17 - 0.2));
	const along = (steps, u) => { const f = clamp(u) * (steps.length - 1), i = Math.min(steps.length - 2, Math.floor(f)), k = f - i; return { x: lerp(steps[i][1], steps[i + 1][1], k), y: lerp(steps[i][2], steps[i + 1][2], k), frame: steps[Math.round(f)][0] }; };
	const where = (legs, t) => {
		let x = legs[0]?.x0 ?? 0, y = legs[0]?.y0 ?? 0, down = 0, hidden = false, ibeam = false, since = 9;
		for (const l of legs) {
			if (l.hidden) { if (t >= l.from && t < l.till) hidden = true; continue; }
			if (t < l.leave) break;
			const a = l.c.act, s = reach((t - l.leave) / (l.arrive - l.leave)), nx = -(l.y1 - l.y0) / (l.d || 1), ny = (l.x1 - l.x0) / (l.d || 1), off = Math.sin(Math.PI * s) * l.bow;
			x = lerp(l.x0, l.x1, s) + nx * off; y = lerp(l.y0, l.y1, s) + ny * off;
			ibeam = !!l.c.ibeam && t > l.arrive - 0.1;
			since = t - l.arrive;
			down = 0;
			if (a.kind === 'drag' && t >= l.c.at) { const p = along(a.steps, carried(l.c, t)); x = p.x; y = p.y; down = t < l.c.to ? 1 : 0; if (t >= l.c.to) { x = a.tx; y = a.ty; } }
			else if (t >= l.c.at) { const n = a.kind === 'triple' ? 3 : a.kind === 'double' ? 2 : 1, dt = t - l.c.at; for (let k = 0; k < n; k++) if (dt >= k * 0.12 && dt < k * 0.12 + 0.1) down = 1; }
		}
		// (at rest it is never quite still)
		if (since > 0.4) { x += 1.2 * Math.sin(2 * Math.PI * 0.37 * t + 1) + 0.6 * Math.sin(2 * Math.PI * 0.61 * t + 2); y += 1.2 * Math.sin(2 * Math.PI * 0.31 * t + 3) + 0.6 * Math.sin(2 * Math.PI * 0.53 * t + 4); }
		return { x, y, down, hidden, ibeam };
	};

	// ---- the picture: which of the take's frames, and how far towards the next ----
	const typed = Object.fromEntries(cues.filter((c) => c.act.kind === 'type').map((c) => [c.a, keyTimes(c.act.text, c.at, c.end, c.i)]));
	/** After something is done the app's own change plays at its own speed: the frame for `ms` after, and the next. */
	const after = (a, ms) => {
		const f = a.after;
		if (!f.length) return { a: a.hover, b: a.hover, k: 0 };
		let i = 0;
		while (i < f.length - 1 && f[i + 1][1] <= ms) i++;
		const next = Math.min(f.length - 1, i + 1);
		return { a: f[i][0], b: f[next][0], k: next === i ? 0 : clamp((ms - f[i][1]) / (f[next][1] - f[i][1])) };
	};
	const still = (f) => ({ a: f, b: f, k: 0 });
	const picture = (surface, t) => {
		// (before anything is done: the folder as it was found; the phone as it was picked up)
		let pic = still(acts[surface === 'phone' ? 'phone-start' : 'start'].hover);
		const legs = surface === 'phone' ? phoneLegs : deskLegs;
		for (const c of cues) {
			const a = c.act;
			if (a.surface !== surface) continue;
			const leg = legs.find((l) => l.c === c), from = leg && !leg.hidden ? leg.arrive : c.at;
			if (t < from) break;
			if (a.kind === 'still') { pic = still(a.hover); continue; }
			if (a.kind === 'type') { const n = typed[c.a].filter((k) => k <= t).length; pic = n === 0 ? pic : t > c.end + 0.05 ? after(a, (t - c.end) * 1000) : { a: a.keys[n - 1], b: a.keys[n - 1], k: 0 }; }
			else if (a.kind === 'drag') { if (t < c.at) pic = { a: a.hover, b: a.hover, k: 0 }; else if (t < c.to) { const f = along(a.steps, carried(c, t)).frame; pic = { a: f, b: f, k: 0 }; } else pic = after(a, (t - c.to) * 1000); }
			else if (a.kind === 'wheel') { if (t < c.at) pic = { a: a.hover, b: a.hover, k: 0 }; else { const u = 1 - Math.pow(1 - clamp((t - c.at) / c.dur), 2.2), f = a.steps[Math.min(a.steps.length - 1, Math.floor(u * a.steps.length))]; pic = t > c.at + c.dur ? after(a, (t - c.at - c.dur) * 1000) : { a: f, b: f, k: 0 }; } }
			else pic = t < c.at ? { a: a.hover, b: a.hover, k: 0 } : after(a, (t - c.at) * 1000);
		}
		return pic;
	};

	// ---- sound: from the same moments ----
	for (const c of cues) {
		const a = c.act, finger = a.surface === 'phone';
		if (a.kind === 'still') continue;
		if (a.kind === 'type') { typed[c.a].forEach((t, i) => sound(t, finger ? 'phone-key' : a.text[i] === ' ' ? 'space' : `key${1 + Math.floor(rand(c.i * 11 + i) * 8)}`, lerp(0.8, 1.1, rand(i * 5.7)), lerp(0.94, 1.06, rand(i * 2.3)))); continue; }
		if (a.kind === 'key') { sound(c.at, 'key3', 1.1, 0.9); continue; }
		if (a.kind === 'wheel') { for (let i = 0; i < 7; i++) sound(c.at + c.dur * (1 - Math.pow(1 - i / 7, 2)) * 0.9, 'tick', 0.8, lerp(0.95, 1.05, rand(i))); continue; }
		if (finger) { sound(c.at, 'tap', 1, lerp(0.96, 1.04, rand(c.i))); continue; }
		const clicks = a.kind === 'triple' ? 3 : a.kind === 'double' ? 2 : 1;
		for (let k = 0; k < clicks; k++) { sound(c.at + k * 0.12, 'click', 1 - k * 0.15, (a.kind === 'right' ? 0.96 : 1) * lerp(0.97, 1.03, rand(c.i + k))); if (a.kind !== 'drag') sound(c.at + k * 0.12 + 0.1, 'click-up', 0.9, lerp(0.97, 1.03, rand(c.i * 3 + k))); }
		if (a.kind === 'drag') { sound(c.at + 0.19, 'brush'); sound(c.to, 'drop'); }
	}
	[5.33, PHONE.in + 0.1, WALL].forEach((t) => sound(t, 'air'));
	sounds.sort((p, q) => p.t - q.t);

	// ---- the camera: a few places over the window, each gone to after its cause, on a spring ----
	const marks = acts['show-changes']?.marks ?? [], line = acts['select-line'], task = acts.task;
	const changed = marks.length ? [marks.reduce((n, m) => n + m[0] + m[2] / 2, 0) / marks.length, marks.reduce((n, m) => n + m[1] + m[3] / 2, 0) / marks.length] : [700, 260];
	const WIDE = [640, 400, 1.38];
	const places = [
		[0, [270, 215, 2.4]], // the explorer and its menu
		[5.33, WIDE], // the whole width of the window, and it stays here for the board, the menus and the page
		[12.45, [806, (line?.y ?? 330) - 20, 1.9]], // close, for the sentence
		[17.43, WIDE],
		[21.08, [changed[0] + 40, changed[1] - 20, 1.7]], // close, for what changed
		[23.5, WIDE],
		[PHONE.deskBack, [940, (task?.y ?? 125) + 190, 1.6]], // the page and the Revision pane beside it
		[38.33, WIDE],
	];
	const N = Math.ceil(LENGTH * FPS) + 1, cam = new Array(N);
	{
		let pos = [...places[0][1]].map((v, i) => i === 2 ? Math.log(v) : v), vel = [0, 0, 0];
		const SUB = 4, dt = 1 / FPS / SUB, w = 8;
		for (let f = 0; f < N; f++) {
			cam[f] = [pos[0], pos[1], Math.exp(pos[2])];
			for (let s = 0; s < SUB; s++) {
				const t = (f + s / SUB) / FPS;
				let target = places[0][1];
				for (const [from, p] of places) if (t >= from) target = p;
				const goal = [target[0], target[1], Math.log(target[2])];
				for (let i = 0; i < 3; i++) { vel[i] += (w * w * (goal[i] - pos[i]) - 2 * w * vel[i]) * dt; pos[i] += vel[i] * dt; }
			}
		}
	}
	const camera = (t) => { const f = clamp(t * FPS, 0, N - 1), i = Math.min(N - 2, Math.floor(f)), k = f - i; return [0, 1, 2].map((n) => lerp(cam[i][n], cam[i + 1][n], k)); };

	/** The music's level: down under the hand's sounds, further under the keys, whole again for the wall. */
	const music = (t) => {
		const ramp = (at, len) => clamp((t - at) / len);
		let db = -4 * ramp(1.1, 0.3) + 4 * ramp(41.23, 0.75);
		for (const c of cues) if (c.act.kind === 'type') db -= 2 * ramp(c.at - 0.3, 0.3) * (1 - ramp(c.end, 0.3));
		return Math.pow(10, db / 20);
	};

	// (the full book fills more of the window: two rows of cards, eight rows in the outliner, a page of text under
	// what changed. Four captions move to where it leaves room.)
	const moved = takes.book === 'full' ? { 1: { y: 740 }, 2: { y: 800 }, 5: { x: 96, y: 700, size: 50, lines: [[21.3, 'Rewrite freely.'], [21.73, 'The old draft'], [21.8, 'is *still* *there.*']] }, 6: { y: 950 } } : {};
	const captions = CAPTIONS.map((c, i) => ({ ...c, ...moved[i] }));
	return { captions, cues, warnings, sounds, deskLegs, phoneLegs, typed, pointer: (t) => where(deskLegs, t), finger: (t) => where(phoneLegs, t), picture, camera, music, lastDesk: acts['export-button']?.hover };
}
