// The book, in one unbroken shot. Six scenes are six boxes from the first frame to the last: rows in a folder, then
// cards on the corkboard, rows of the outliner, the scenes of the manuscript's page, cards on the timeline. Each box
// has a place and a look in each of the five, and what is drawn is a blend of two of them, so nothing is cut: one
// view turns into the next. Times are in beats (kit's `b`).
import React from 'react';
import { BOOK } from './book';
import { along, back, C, Caption, clamp01, Dot, Headline, inOut, mix, num, Pointer, prog, Ripple, Shot, tempo, TINT, useT } from './kit';

const { b, d } = tempo(112); // no track yet: a tempo to be changed for one
export const BOOK_LENGTH = b(68);

// ---- where a scene is, in each view ----
type Rect = { x: number; y: number; w: number; h: number };
const ROW = 68, LX = 690, LW = 540, LY = 372;
const CW = 500, CH = 250, GAP = 28, GX = (1920 - (3 * CW + 2 * GAP)) / 2, GY = 268;
const TX = 260, TW = 1400, TY = 246, HH = 54, RH = 92;
const SX = 560, KW = 430, KH = 128, WHEN_AT = [[0, 262], [0, 452], [1, 452], [0, 642], [0, 792], [1, 792]];
const row = (slot: number): Rect => ({ x: LX, y: LY + slot * ROW, w: LW, h: ROW - 8 });
const card = (slot: number): Rect => ({ x: GX + (slot % 3) * (CW + GAP), y: GY + Math.floor(slot / 3) * (CH + GAP), w: CW, h: CH });
const line = (i: number): Rect => ({ x: TX, y: TY + HH + i * RH, w: TW, h: RH });
const section = (i: number): Rect => ({ x: 510, y: 300 + i * 186, w: 900, h: 30 });
const dated = (i: number): Rect => ({ x: SX + 44 + WHEN_AT[i][0] * (KW + 22), y: WHEN_AT[i][1], w: KW, h: KH });
// the title's x, y, size and weight in each view
const TITLE = { L: [50, 9, 30, 450], C: [26, 20, 30, 680], O: [22, 13, 27, 560], M: [0, 0, 20, 450], T: [22, 16, 26, 680] };
const COLS: [string, number, number, 'left' | 'right'][] = [['Title', 0, 640, 'left'], ['Label', 640, 230, 'left'], ['Status', 870, 170, 'left'], ['Words', 1040, 110, 'right'], ['Target', 1150, 110, 'right'], ['Progress', 1260, 140, 'right']];
const PROSE = [
	'From the sea it was the only thing on that coast a pilot trusted. It turned once in every twelve seconds.',
	'The supply boat left Mara on the jetty with two cases and a letter she had not opened.',
	'He was a smaller man than nineteen years of the light had made him in her mind.',
	'The glass fell all afternoon, and the birds left the rock before the wind came.',
	'For a long time the flare hung over the Skerry, and nothing on the island answered it.',
	'For eleven minutes there was no light on that coast at all.',
];
const TYPED = ' It did not wait. She watched it go.';
const WHEN: { y: number; year?: string; date: string; gap?: string }[] = [{ y: 262, year: '1986', date: 'December', gap: '6 months' }, { y: 452, year: '1987', date: '11 June', gap: '4 months' }, { y: 642, date: '2 October' }, { y: 792, date: '3 October' }];

// ---- when ----
// the list: by name; Prologue dragged up; then the rest, with "Lights out" still a place early, for the corkboard to mend
const BY_NAME = [2, 0, 4, 3, 5, 1], SORTED = [0, 1, 2, 4, 5, 3];
const DRAG = b(12), DRAG_LEN = d(1.6), SORT = b(15), TO_CARDS = b(20), CARD_DRAG = b(24.5), CARD_DRAG_LEN = d(1.7), CLOSE = b(28), CLICK = b(31), FILL = b(32);
const TO_OUTLINER = b(36), TO_PAGE = b(44), TYPE = b(49.5), TO_TIME = b(56), TURN = d(2);

const listSlot = (id: number, t: number) => {
	if (t >= SORT) return mix([0, 1, 4, 3, 5, 2][id], SORTED[id], prog(t, SORT + id * 0.05, d(1.8), back));
	const dragged = mix(2, 0, prog(t, DRAG, DRAG_LEN, inOut));
	if (id === 0) return dragged;
	const base = BY_NAME[id];
	return base < 2 ? base + prog(clamp01((base + 0.5 - dragged) / 0.5), 0, 1, inOut) : base;
};
const cardRect = (id: number, t: number): Rect => {
	const x = mix(card(3).x, card(5).x, prog(t, CARD_DRAG, CARD_DRAG_LEN, inOut));
	if (id === 5) return { ...card(5), x };
	if (id < 3) return card(id);
	const r = card(SORTED[id]);
	return { ...r, x: r.x - (CW + GAP) * prog(clamp01((x - (r.x - CW / 2)) / (CW / 2)), 0, 1, inOut) };
};
/** How much of each view a scene is in at `t`: they add up to one. */
const views = (id: number, t: number) => {
	const a = prog(t, TO_CARDS + id * 0.055, TURN, inOut), o = prog(t, TO_OUTLINER + d(0.6) + id * 0.05, TURN, inOut), m = prog(t, TO_PAGE + id * 0.05, TURN, inOut), w = prog(t, TO_TIME + id * 0.05, TURN, inOut);
	return { L: 1 - a, C: a * (1 - o), O: o * (1 - m), M: m * (1 - w), T: w };
};

export const Book: React.FC = () => {
	const t = useT(), last = card(5);
	// the pointer: to Prologue and up with it; later to "Lights out", along the board with it, and to its status
	const grab1: [number, number] = [LX + 300, LY + 2 * ROW + 30], grab2: [number, number] = [card(3).x + 250, card(3).y + 70];
	const first = t < b(18);
	const ptr = t < DRAG ? along(t, [[b(9.5), 1560, 1010], [b(11.4), ...grab1], [DRAG, ...grab1]])
		: t < b(14) ? { x: grab1[0], y: LY + listSlot(0, Math.min(t, SORT - 0.01)) * ROW + 30 }
		: first ? along(t, [[b(14), LX + 300, LY + 30], [b(15.6), 1500, 840]])
		: t < CARD_DRAG ? along(t, [[b(22.4), 1640, 1040], [b(24), ...grab2], [CARD_DRAG, ...grab2]])
		: t < CARD_DRAG + CARD_DRAG_LEN ? { x: cardRect(5, t).x + 250, y: grab2[1] }
		: along(t, [[b(27), last.x + 250, last.y + 70], [b(30.4), last.x + 62, last.y + CH - 30], [CLICK + 0.25, last.x + 62, last.y + CH - 30], [b(33.2), last.x + 400, last.y + CH - 10]]);
	const ptrOn = first ? prog(t, b(9.5), 0.3) * (1 - prog(t, b(14.6), 0.4)) : prog(t, b(22.4), 0.3) * (1 - prog(t, b(32.2), 0.4));
	const press = first ? prog(t, DRAG - 0.08, 0.1) * (1 - prog(t, b(13.75), 0.12)) : t < b(29) ? prog(t, CARD_DRAG - 0.08, 0.1) * (1 - prog(t, b(26.35), 0.12)) : prog(t, CLICK - 0.08, 0.08) * (1 - prog(t, CLICK + 0.06, 0.12));

	// the camera: close on the folder; back for the board; close on the card that moved; back; a little in on the
	// outliner; close on the line being typed; back for the timeline. Each move is finished before the next begins.
	let cam = [1.42, 960, 498];
	const to = (target: number[], p: number) => { cam = cam.map((v, i) => mix(v, target[i], p)); };
	const wide = [1, 960, 540], typing = section(1);
	to(wide, prog(t, TO_CARDS - 0.1, d(2.1), inOut));
	to([2.55, last.x + CW / 2, last.y + CH / 2], prog(t, CLOSE, d(2.1), inOut));
	to(wide, prog(t, TO_OUTLINER, d(2.2), inOut));
	to([1.15, 960, 545], prog(t, TO_OUTLINER + d(2.4), d(5), inOut));
	to(wide, prog(t, TO_PAGE, d(1.8), inOut));
	to([1.5, 900, typing.y + 130], prog(t, TO_PAGE + d(3.6), d(2.4), inOut));
	to(wide, prog(t, TO_TIME - d(0.4), d(2.2), inOut));
	to([1.06, 940, 560], prog(t, TO_TIME + d(2), d(8), inOut));
	const [s, cx, cy] = cam;

	const folder = 1 - prog(t, TO_CARDS - 0.1, 0.5), tagged = prog(t, SORT + d(1.4), 0.5);
	const table = prog(t, TO_OUTLINER + d(1.6), d(1.4)) * (1 - prog(t, TO_PAGE, d(1))), counted = (i: number) => prog(t, TO_OUTLINER + d(2.2) + i * 0.09, d(2.4), inOut);
	const page = prog(t, TO_PAGE + d(0.3), d(1.6)) * (1 - prog(t, TO_TIME, d(1.2))), spine = prog(t, TO_TIME + d(0.8), d(2.4), inOut);
	const typed = TYPED.slice(0, Math.floor(TYPED.length * clamp01((t - TYPE) / d(3.4))));
	const caret = t > TYPE - d(0.6) && (t < TYPE + d(3.4) || Math.floor((t - TYPE) * 2.4) % 2 === 0) ? 1 : 0;

	return (
		<Shot length={BOOK_LENGTH} enter={0}>
			<Headline text="Folders list notes by name." at={b(0.5)} dock={b(3.6)} gone={b(7.5)} />
			<Headline text="Books don’t work *that* *way.*" at={b(8)} docked gone={b(13.5)} accent={C.red} />
			<Headline text="Binders keeps them *in* *order.*" at={b(14.1)} docked gone={b(18.5)} />
			<Headline text="See the book as a *corkboard.*" at={b(19.2)} docked gone={b(27.4)} />
			<Headline text="Or as an *outliner.*" at={b(37)} docked gone={b(43.3)} />
			<Headline text="Or the whole book, as *one* *page.*" at={b(44.4)} docked gone={b(47.8)} />
			<Headline text="Or along *story* *time.*" at={b(57.4)} docked gone={b(66)} />

			<div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})` }}>
				{/* the folder: a quiet panel, its own row, and the guide line its notes hang from */}
				<div style={{ position: 'absolute', left: LX - 26, top: LY - ROW - 22, width: LW + 52, height: 7 * ROW + 36, borderRadius: 24, background: C.panel, border: `1.5px solid ${C.line}`, opacity: prog(t, b(4.4), 0.6) * folder, transform: `translateY(${(1 - prog(t, b(4.4), 0.8)) * 40}px)` }} />
				<div style={{ position: 'absolute', left: LX, top: LY - ROW, width: LW, height: ROW - 8, display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', boxSizing: 'border-box', fontSize: 30, fontWeight: 560, letterSpacing: '-0.015em', color: C.ink, opacity: prog(t, b(4.7), 0.6) * folder }}>
					<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
					<span style={{ flex: 1 }}>The Lighthouse</span>
					<span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: C.deep, background: 'rgba(124,92,240,.12)', padding: '5px 10px', borderRadius: 7, opacity: tagged, transform: `scale(${mix(0.7, 1, prog(t, SORT + d(1.4), 0.5, back))})` }}>BINDER</span>
				</div>
				<div style={{ position: 'absolute', left: LX + 30, top: LY, width: 2, height: 6 * ROW - 8, background: C.line, opacity: prog(t, b(5), 0.6) * folder }} />

				{/* the outliner's head and rules */}
				<div style={{ position: 'absolute', left: TX, top: TY, width: TW, height: HH, fontSize: 22, color: C.soft, borderBottom: `1.5px solid ${C.line}`, opacity: table }}>
					{COLS.map(([name, x, w, align], i) => <div key={i} style={{ position: 'absolute', left: x + 22, width: w - 44, top: 12, textAlign: align }}>{name}</div>)}
				</div>
				{COLS.slice(1).map(([, x], i) => <div key={i} style={{ position: 'absolute', left: TX + x, top: TY, width: 1.5, height: (HH + 6 * RH) * prog(t, TO_OUTLINER + d(1.6) + i * 0.05, d(1.8)), background: C.line, opacity: table }} />)}

				{/* the manuscript's page, and what is written under each scene's name */}
				<div style={{ position: 'absolute', left: 420, top: 236 + (1 - page) * 50, width: 1080, height: 1300, background: '#fff', border: `1.5px solid ${C.line}`, borderRadius: 22, boxShadow: '0 30px 80px rgba(30,25,70,.10)', opacity: page }} />
				{PROSE.map((text, i) => (
					<div key={i} style={{ position: 'absolute', left: 510, top: section(i).y + 46, width: 900, fontSize: 28, lineHeight: 1.6, letterSpacing: '-0.005em', color: C.ink, opacity: prog(t, TO_PAGE + d(1.5) + i * 0.08, d(1.4)) * (1 - prog(t, TO_TIME - d(0.2), d(0.9))) }}>
						{text}{i === 1 && <>{typed}<span style={{ display: 'inline-block', width: 2.5, height: 34, margin: '0 0 -7px 2px', background: C.violet, opacity: caret }} /></>}
					</div>
				))}

				{/* the timeline's spine and its dates */}
				<div style={{ position: 'absolute', left: SX, top: 250, width: 2.5, height: 690 * spine, background: C.line, borderRadius: 2 }} />
				{WHEN.map((w, g) => {
					const p = prog(t, TO_TIME + d(1.2) + g * 0.16, 0.7);
					return (
						<React.Fragment key={g}>
							<div style={{ position: 'absolute', left: SX - 260, top: w.y + 12, width: 236, textAlign: 'right', opacity: p, transform: `translateX(${(1 - p) * 16}px)` }}>
								{w.year && <div style={{ fontSize: 30, fontWeight: 680, letterSpacing: '-0.02em', color: C.ink, marginBottom: 6 }}>{w.year}</div>}
								<div style={{ fontSize: 24, color: C.soft }}>{w.date}</div>
							</div>
							<div style={{ position: 'absolute', left: SX - 9, top: w.y + (w.year ? 64 : 22), width: 20, height: 2.5, background: C.faint, opacity: p }} />
							{w.gap && <div style={{ position: 'absolute', left: SX - 260, top: w.y + KH + 20, width: 236, textAlign: 'right', fontSize: 19, color: C.faint, opacity: prog(t, TO_TIME + d(2.2) + g * 0.16, 0.7) }}>{w.gap}</div>}
						</React.Fragment>
					);
				})}

				{BOOK.map((sc, id) => {
					const v = views(id, t), tint = TINT[sc.color], look = (n: number) => clamp01((n - 0.5) * 2);
					const rects = { L: row(listSlot(id, t)), C: cardRect(id, t), O: line(id), M: section(id), T: dated(id) };
					const at = (f: (r: Rect) => number) => v.L * f(rects.L) + v.C * f(rects.C) + v.O * f(rects.O) + v.M * f(rects.M) + v.T * f(rects.T);
					const title = (k: number) => v.L * TITLE.L[k] + v.C * TITLE.C[k] + v.O * TITLE.O[k] + v.M * TITLE.M[k] + v.T * TITLE.T[k];
					const lift = id === 0 ? prog(t, DRAG - 0.06, 0.2) * (1 - prog(t, b(13.75), 0.3)) : id === 5 ? prog(t, CARD_DRAG - 0.06, 0.2) * (1 - prog(t, b(26.3), 0.35)) : 0;
					const arrive = prog(t, b(4.9) + BY_NAME[id] * 0.07, 0.7), filled = clamp01((v.C + v.T - 0.4) / 0.6), body = prog(t, TO_CARDS + d(1.3) + id * 0.055, 0.6);
					const revised = id === 5 ? prog(t, CLICK, 0.3) : 0, fill = id === 5 ? prog(t, FILL, d(2.4), inOut) : 0;
					const words = id === 5 ? mix(sc.words, sc.target, fill) : sc.words, done = clamp01(words / sc.target), status = id === 5 && revised > 0.5 ? 'Revised' : sc.status;
					const n = counted(id), bar = (width: number, part: number) => <span style={{ width, height: 7, borderRadius: 4, background: 'rgba(40,40,70,.12)', overflow: 'hidden', flex: 'none' }}><span style={{ display: 'block', width: `${part * 100}%`, height: '100%', borderRadius: 4, background: part >= 1 ? C.green : C.violet }} /></span>;
					const cell = (i: number, top: number): React.CSSProperties => ({ position: 'absolute', left: COLS[i][1] + 22, width: COLS[i][2] - 44, top, textAlign: COLS[i][3], whiteSpace: 'nowrap' });
					return (
						<div key={id} style={{ position: 'absolute', left: at((r) => r.x), top: at((r) => r.y) + (1 - arrive) * 26, width: at((r) => r.w), height: at((r) => r.h), opacity: arrive, zIndex: lift > 0 ? 20 : 1, transform: `scale(${1 + lift * 0.035}) rotate(${lift * (id === 5 ? 1.6 : 0)}deg)`, borderRadius: v.L * 12 + filled * 16, boxSizing: 'border-box', backgroundColor: filled > 0 ? `color-mix(in srgb, ${tint.bg} ${filled * 100}%, transparent)` : lift > 0 ? '#fff' : 'transparent', border: `2.5px solid color-mix(in srgb, ${tint.bd} ${filled * 100}%, transparent)`, boxShadow: `0 ${lift * 22}px ${lift * 48}px rgba(30,25,70,${lift * 0.2}), 0 0 0 ${filled > 0 ? 0 : lift * 1.5}px ${C.line}`, overflow: 'hidden' }}>
							{/* the manuscript's rule, and the outliner's line under a row */}
							<div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1.5, background: C.line, opacity: look(v.M) }} />
							<div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5, background: C.line, opacity: look(v.O) }} />
							<div style={{ position: 'absolute', left: title(0), top: title(1), fontSize: title(2), fontWeight: title(3), letterSpacing: '-0.015em', color: `color-mix(in srgb, ${C.faint} ${v.M * 100}%, ${C.ink})`, background: `rgba(255,255,255,${v.M})`, paddingRight: 18 * v.M, whiteSpace: 'nowrap' }}>{sc.name}</div>
							<div style={{ position: 'absolute', right: 20, top: 22, opacity: (1 - (1 - v.L) * 2.5) * prog(t, SORT + d(1.3) + id * 0.05, 0.4), transform: `scale(${prog(t, SORT + d(1.3) + id * 0.05, 0.45, back)})` }}><Dot color={sc.color} /></div>
							{/* on the corkboard */}
							<div style={{ position: 'absolute', left: 26, top: 72, width: CW - 57, fontSize: 23.5, lineHeight: 1.42, color: '#2a2a33', opacity: body * look(v.C) }}>{sc.synopsis}</div>
							<div style={{ position: 'absolute', left: 26, top: CH - 49, width: CW - 57, display: 'flex', alignItems: 'center', fontSize: 20, color: C.soft, opacity: body * look(v.C), whiteSpace: 'nowrap' }}>
								<span style={{ position: 'relative', flex: 1 }}>
									<span style={{ opacity: 1 - revised }}>{sc.status}</span>
									<span style={{ position: 'absolute', left: 0, top: 0, opacity: revised, color: C.ink, fontWeight: 560 }}>Revised</span>
								</span>
								{bar(62, done)}<span style={{ marginLeft: 12, fontVariantNumeric: 'tabular-nums' }}>{num(words)} / {num(sc.target)} words</span>
							</div>
							{/* in the outliner */}
							<div style={{ position: 'absolute', inset: 0, opacity: look(v.O), fontSize: 25, color: C.ink }}>
								<div style={{ ...cell(0, 50), fontSize: 21, color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.synopsis}</div>
								<div style={{ ...cell(1, 28), display: 'flex', alignItems: 'center', gap: 12 }}><Dot color={sc.color} />{sc.label}</div>
								<div style={{ ...cell(2, 28), color: status === 'Draft' ? C.soft : C.ink }}>{status}</div>
								<div style={{ ...cell(3, 28), fontVariantNumeric: 'tabular-nums' }}>{num(words * n)}</div>
								<div style={{ ...cell(4, 28), fontVariantNumeric: 'tabular-nums', color: C.soft }}>{num(sc.target)}</div>
								<div style={{ ...cell(5, 28), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, fontSize: 21, color: C.soft, fontVariantNumeric: 'tabular-nums' }}>{bar(54, done * n)}{Math.round(done * n * 100)}%</div>
							</div>
							{/* on the timeline */}
							<div style={{ position: 'absolute', left: 22, top: 56, width: KW - 49, fontSize: 19.5, lineHeight: 1.4, color: '#2a2a33', opacity: look(v.T), display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sc.synopsis}</div>
						</div>
					);
				})}
				<Ripple x={last.x + 62} y={last.y + CH - 30} at={CLICK} />
				<Pointer x={ptr.x} y={ptr.y} press={press} opacity={ptrOn} scale={1 / Math.sqrt(s)} />
			</div>
			<Caption text="A synopsis, a status and a target on every card." at={b(29.6)} gone={b(35.2)} />
			<Caption text="Every scene, its status and its target, at a glance." at={b(39.5)} gone={b(43.3)} />
			<Caption text="Type anywhere. Each scene is still its own note." at={b(50)} gone={b(55.2)} band />
		</Shot>
	);
};
