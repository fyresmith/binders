// What every shot is made of: the colours, the easing, words that arrive one at a time, the drawn pointer.
import React from 'react';
import { continueRender, delayRender, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const W = 1920, H = 1080;
/** A film is cut to its music: its times are written in beats. `b` gives a beat's time in seconds and `d` a length
    in beats as seconds, for a track of `bpm` whose first beat is `offset` seconds in. */
export const tempo = (bpm: number, offset = 0) => ({ b: (beats: number) => offset + beats * 60 / bpm, d: (beats: number) => beats * 60 / bpm });
export const C = {
	bg: '#ffffff', ink: '#17171c', soft: '#6c6c78', faint: '#a9a9b4', line: '#e4e4ea', panel: '#f6f6f9',
	violet: '#7c5cf0', deep: '#6d4fd8',
	blue: '#086ddd', orange: '#ec7500', green: '#08b94e', red: '#e93147',
};
/** A card's fill and border for each label colour, as the light theme has them. */
export const TINT: Record<string, { bg: string; bd: string }> = {
	green: { bg: '#e9f6ec', bd: '#3aa35a' }, blue: { bg: '#ecf3fe', bd: '#4a90e2' },
	orange: { bg: '#fff4ea', bd: '#f0a05a' }, red: { bg: '#fdeeee', bd: '#e8606a' },
};
export const FONT = '"Inter", system-ui, sans-serif';

// Inter, from the banner's fonts: the render waits for it, so no frame is drawn in a fallback face.
if (typeof document !== 'undefined') {
	const wait = delayRender('Inter');
	const face = new FontFace('Inter', `url(${staticFile('Inter.woff2')}) format('woff2')`, { weight: '100 900' });
	face.load().then(() => { document.fonts.add(face); continueRender(wait); }).catch(() => continueRender(wait));
}

export const out = Easing.bezier(0.16, 1, 0.3, 1), inOut = Easing.bezier(0.65, 0, 0.35, 1), back = Easing.bezier(0.3, 1.35, 0.5, 1), into = Easing.in(Easing.cubic);
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
/** 0 to 1 over `dur` seconds from `start`, eased. */
export const prog = (t: number, start: number, dur: number, easing: (n: number) => number = out) =>
	interpolate(t, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
/** The shot's own time, in seconds. */
export const useT = () => useCurrentFrame() / useVideoConfig().fps;
export const num = (n: number) => Math.round(n).toLocaleString('en-US');

/** Words that rise out of a blur one after another; *starred* words take the accent. `gone` is when they leave. */
export const Words: React.FC<{ text: string; at: number; gone?: number; accent?: string; step?: number }> = ({ text, at, gone, accent = C.violet, step = 0.085 }) => {
	const t = useT();
	const q = gone == null ? 0 : prog(t, gone, 0.35, into);
	let i = 0;
	return <>{text.split('\n').map((line, l) => (
		<div key={l} style={{ whiteSpace: 'nowrap' }}>{line.split(' ').map((raw, k) => {
			const starred = raw.startsWith('*'), word = raw.replace(/\*/g, ''), p = prog(t, at + i++ * step, 0.75);
			return <span key={k} style={{ display: 'inline-block', marginRight: '0.26em', color: starred ? accent : undefined, opacity: p * (1 - q), filter: `blur(${(1 - p) * 12 + q * 10}px)`, transform: `translateY(${(1 - p) * 0.45 - q * 0.25}em)` }}>{word}</span>;
		})}</div>
	))}</>;
};

/** A headline. It arrives in the middle of the frame; at `dock` it goes up to make room for what it names (`docked`: it
    arrives there). */
export const Headline: React.FC<{ text: string; at: number; dock?: number; docked?: boolean; gone?: number; accent?: string; size?: number }> = ({ text, at, dock, docked, gone, accent, size = 92 }) => {
	const t = useT();
	const d = docked ? 1 : dock == null ? 0 : prog(t, dock, 0.9, inOut);
	return (
		<div style={{ position: 'absolute', left: 0, right: 0, top: mix(H / 2, 138, d), transform: `translateY(-50%) scale(${mix(1, 0.6, d)})`, textAlign: 'center', fontFamily: FONT, fontSize: size, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.12, color: C.ink }}>
			<Words text={text} at={at} gone={gone} accent={accent} />
		</div>
	);
};

/** A line under the action, small. */
export const Caption: React.FC<{ text: string; at: number; gone: number; y?: number; band?: boolean }> = ({ text, at, gone, y = 968, band }) => (<>
	{band && <Band at={at} gone={gone} />}
	<div style={{ position: 'absolute', left: 0, right: 0, top: y, textAlign: 'center', fontFamily: FONT, fontSize: 38, fontWeight: 520, letterSpacing: '-0.02em', color: C.soft }}>
		<Words text={text} at={at} gone={gone} step={0.05} />
	</div>
</>);
/** White rising from the foot of the frame, for a caption that lies over a page of text. */
const Band: React.FC<{ at: number; gone: number }> = ({ at, gone }) => {
	const t = useT();
	return <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, background: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff 52%)', opacity: prog(t, at - 0.3, 0.6) * (1 - prog(t, gone, 0.5)) }} />;
};

/** The drawn pointer: its tip is at x, y. `press` (0 to 1) is a button held. */
export const Pointer: React.FC<{ x: number; y: number; press?: number; opacity?: number; scale?: number }> = ({ x, y, press = 0, opacity = 1, scale = 1 }) => (
	<svg width={64} height={64} viewBox="0 0 32 32" style={{ position: 'absolute', left: x - 6, top: y - 4, opacity, transformOrigin: '6px 4px', transform: `scale(${scale * (1 - press * 0.14)})`, filter: 'drop-shadow(0 6px 10px rgba(20,20,40,.28))', zIndex: 50 }}>
		<path d="M3 2 L3 24.5 L9.2 18.9 L13.3 28.3 L17.4 26.5 L13.4 17.3 L21.6 17.1 Z" fill="#111114" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
	</svg>
);
/** A ring that opens where a click lands. */
export const Ripple: React.FC<{ x: number; y: number; at: number; color?: string }> = ({ x, y, at, color = C.violet }) => {
	const p = prog(useT(), at, 0.6);
	if (p <= 0 || p >= 1) return null;
	const r = 14 + p * 46;
	return <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, border: `3px solid ${color}`, opacity: (1 - p) * 0.7, zIndex: 40 }} />;
};

/** Where the pointer is at `t`, from a list of [time, x, y] it passes through, eased between each pair. */
export const along = (t: number, keys: [number, number, number][]) => {
	if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2] };
	for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
		const [t0, x0, y0] = keys[i - 1], [t1, x1, y1] = keys[i], p = prog(t, t0, t1 - t0, inOut);
		return { x: mix(x0, x1, p), y: mix(y0, y1, p) };
	}
	const last = keys[keys.length - 1];
	return { x: last[1], y: last[2] };
};

/** A shot: fades and sharpens in at its start, and out over its last `leave` seconds. */
export const Shot: React.FC<{ length: number; enter?: number; leave?: number; children: React.ReactNode; bg?: string }> = ({ length, enter = 0.35, leave = 0.4, children, bg = C.bg }) => {
	const t = useT(), a = enter ? prog(t, 0, enter) : 1, b = leave ? prog(t, length - leave, leave, into) : 0;
	return <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden', fontFamily: FONT, opacity: a * (1 - b), filter: b > 0 ? `blur(${b * 14}px)` : undefined }}>{children}</div>;
};

/** A label's dot, as in the file explorer. */
export const Dot: React.FC<{ color: string; scale?: number }> = ({ color, scale = 1 }) => <div style={{ width: 18, height: 11, borderRadius: 3.5, background: (C as Record<string, string>)[color], transform: `scale(${scale})` }} />;

/** The mark, "in order": three scenes, the middle one on its way to its place. `p` (0 to 1) moves it there. */
export const Mark: React.FC<{ size: number; color?: string; p?: number; stroke?: number }> = ({ size, color = C.deep, p = 0, stroke = 2.3 }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
		<rect x="3" y="3" width="13" height="5" rx="1.5" /><rect x={mix(8, 3, p)} y="9.5" width="13" height="5" rx="1.5" /><rect x="3" y="16" width="13" height="5" rx="1.5" />
	</svg>
);
