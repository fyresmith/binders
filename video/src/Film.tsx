// The film: one evening's work on a novel, in the real app. What was done is the take (takes.mjs); when, and
// everything that follows from when, is the direction (direction.mjs); this draws it: the window under the camera,
// the pointer, the phone and its finger, the captions, the wall of everything else, the name, and the sound.
// STORYBOARD.md says what happens in each second and why.
import React from 'react';
import { Audio, Img, Sequence, staticFile } from 'remotion';
import { direct, FPS, LENGTH, NAME, PHONE, WALL } from './direction.mjs';
import TAKES from './takes.json';
import { FONT, inOut, Mark, mix, out, prog, useT, Words } from './kit';

export const FILM_LENGTH = LENGTH;
const film = direct(TAKES as never);
const BG = '#0a0a0e', VIOLET = '#8a6cf7', PW = 1280, PH = 800;
const frame = (i: number) => staticFile(`takes/f${String(i).padStart(4, '0')}.jpg`);
const plate = (name: string) => staticFile(`plates/${name}-dark.png`);
const cubicIn = (n: number) => n * n * n;

/** A picture of the app, and the next one coming through it: the app's own changes at their own speed. */
const Picture: React.FC<{ pic: { a: number; b: number; k: number }; style: React.CSSProperties }> = ({ pic, style }) => (<>
	<Img src={frame(pic.a)} style={style} />
	{pic.k > 0 && pic.b !== pic.a && <Img src={frame(pic.b)} style={{ ...style, opacity: pic.k }} />}
</>);

/** The pointer: an arrow, or the bar it becomes over text. Its tip (or middle) is at x, y, in the window's points. */
const Hand: React.FC<{ x: number; y: number; press: number; opacity: number; scale: number; ibeam: boolean }> = ({ x, y, press, opacity, scale, ibeam }) => ibeam ? (
	<svg width={20} height={30} viewBox="0 0 20 30" style={{ position: 'absolute', left: x - 10, top: y - 15, opacity, transform: `scale(${scale})`, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))', zIndex: 50 }}>
		<path d="M5 2 Q10 2 10 6 Q10 2 15 2 M10 6 V24 M5 28 Q10 28 10 24 Q10 28 15 28" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
	</svg>
) : (
	<svg width={32} height={32} viewBox="0 0 32 32" style={{ position: 'absolute', left: x - 3, top: y - 2, opacity, transformOrigin: '3px 2px', transform: `scale(${scale * (1 - press * 0.12)})`, filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))', zIndex: 50 }}>
		<path d="M3 2 L3 24.5 L9.2 18.9 L13.3 28.3 L17.4 26.5 L13.4 17.3 L21.6 17.1 Z" fill="#111114" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
	</svg>
);

/** A caption. Each word comes up from under its own line, one after another; a starred word is underlined as it
    lands. What keeps it readable over the app is a shadow the letters cast themselves, close and then wide: it is
    there only where a letter is, so nothing gives away a line that has not come yet. At `out` every line goes up
    and away. */
const Caption: React.FC<{ x: number; y: number; align: string; size: number; out: number; lines: (string | number)[][] }> = ({ x, y, align, size, out: leave, lines }) => {
	const t = useT(), first = lines[0][0] as number;
	if (t < first - 0.05 || t > leave + 0.45) return null;
		const shift = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
	return (
		<div style={{ position: 'absolute', left: x, top: y, transform: `translate(${shift}, -50%)`, textAlign: align as 'left', fontSize: size, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.14, color: '#fff', whiteSpace: 'nowrap', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.95)) drop-shadow(0 3px 14px rgba(0,0,0,.8)) drop-shadow(0 0 42px rgba(0,0,0,.55))' }}>
			{lines.map(([at, text], l) => {
				let n = 0;
				return (
					<div key={l} style={{ position: 'relative', overflow: 'hidden', padding: '0.06em 0.04em 0.14em', margin: '-0.06em -0.04em -0.14em' }}>
						{(text as string).split(' ').map((raw, k) => {
							const starred = raw.startsWith('*'), start = (at as number) + n++ * 0.055, p = prog(t, start, 0.6, out), q = prog(t, leave + l * 0.04, 0.26, cubicIn), line = prog(t, start + 0.22, 0.42, out) * (1 - q);
							return (
								<span key={k} style={{ display: 'inline-block', position: 'relative', marginRight: '0.24em', transform: `translateY(${(1 - p) * 112 - q * 112}%) rotate(${(1 - p) * 5}deg)`, transformOrigin: '0 100%', opacity: p > 0 ? 1 : 0 }}>
									{raw.replace(/\*/g, '')}
									{starred && <span style={{ position: 'absolute', left: 0, bottom: '-0.02em', height: Math.max(4, size * 0.075), width: `${line * 100}%`, borderRadius: 99, background: VIOLET }} />}
								</span>
							);
						})}
					</div>
				);
			})}
		</div>
	);
};

const WALL_PICTURES =['focus-mode', 'outliner', 'import', 'timeline', 'corkboard', 'inspector', 'snapshots', '', 'arrange-by-label', 'manuscript', 'export-paperback', 'export-styles', 'progress', 'progress-deadline', 'binder-snapshots', 'revision-pane', 'timeline-across', 'manuscript-synopses', 'revision-capture', 'progress-first-days'];

export const Film: React.FC = () => {
	const t = useT(), [cx, cy, s] = film.camera(t);
	const layer: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: PW, height: PH, display: 'block' };

	// the desk: its picture, the pointer over it, a ring where a click told the app something
	const desk = film.picture('desk', t), ptr = film.pointer(t);
	const press = [0, 0.015, 0.03, 0.045].reduce((n, d) => n + film.pointer(t - d).down / 4, 0);
	const away = prog(t, PHONE.in + 0.1, 0.5, inOut) * (1 - prog(t, PHONE.deskBack, 0.45, inOut)); // while the phone is up
	const ptrOn = prog(t, 0.5, 0.2) * (1 - prog(t, PHONE.in - 0.1, 0.2)) + prog(t, PHONE.deskBack + 0.15, 0.25) * (1 - prog(t, WALL - 0.05, 0.15));
	const typing = ptr.hidden ? 0 : 1;
	const rings = film.cues.filter((c) => c.act.surface === 'desk' && !c.pop && ['click', 'double', 'triple'].includes(c.act.kind) && c.a !== 'select-line');

	// the phone: up in front of the desk, closer for the line typed into it, and away
	const up = prog(t, PHONE.in + 0.1, 0.65, out) * (1 - prog(t, PHONE.out, 0.4, cubicIn));
	const close = prog(t, 30.3, 0.6, inOut) * (1 - prog(t, 33.9, 0.5, inOut));
	const phone = film.picture('phone', t), finger = film.finger(t);
	const PS = 900 / 844 * mix(1, 1.4, close), phoneLeft = 960 - 195 * PS, phoneTop = mix(90, -400, close) + (1 - up) * 1150;

	// the wall: the window is its eighth picture, and the camera draws back from it, slowing all the way
	const inWall = t >= WALL, back = prog(t, WALL, NAME - WALL, (n) => 1 - Math.pow(1 - n, 2.6));
	const named = prog(t, NAME, 0.5, out), gone = prog(t, 47.9, 1.3, inOut), said = prog(t, 41.7, 0.45, out); // (the wall steps back for the last caption and stays back: the name takes it further)
	const COLS = 5, GAP = 70, focus = [2, 1], ws = 1.38 * Math.pow(0.262 / 1.38, back);
	const fx = focus[0] * (PW + GAP) + PW / 2, fy = focus[1] * (PH + GAP) + PH / 2, wx = mix(fx, (COLS * PW + (COLS - 1) * GAP) / 2, back), wy = mix(fy, (4 * PH + 3 * GAP) / 2, back);

	return (
		<div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `radial-gradient(90% 70% at 50% 40%, #16122a 0%, ${BG} 72%)`, fontFamily: FONT }}>
			<Audio src={staticFile('music/little-alicia.mp3')} volume={(f) => film.music(f / FPS)} />
			{film.sounds.map((snd, i) => <Sequence key={i} from={Math.round(snd.t * FPS)} durationInFrames={FPS}><Audio src={staticFile(`sfx/${snd.name}.wav`)} volume={snd.gain} playbackRate={snd.rate} /></Sequence>)}

			{!inWall && (
				<div style={{ position: 'absolute', left: 0, top: 0, width: PW, height: PH, transformOrigin: '0 0', transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})`, filter: away > 0 ? `blur(${away * 5}px) brightness(${1 - away * 0.62})` : undefined }}>
					<div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden', transformOrigin: '50% 50%', transform: `scale(${1 - away * 0.06})`, boxShadow: '0 0 0 1px rgba(255,255,255,.09), 0 40px 120px rgba(0,0,0,.7), 0 0 180px rgba(138,108,247,.16)' }}>
						<Picture pic={desk} style={layer} />
					</div>
					{rings.map((c) => {
						const p = prog(t, c.at, 0.32, out), r = mix(5, 22, p);
						return p > 0 && p < 1 && <div key={c.a} style={{ position: 'absolute', left: c.act.x - r, top: c.act.y - r, width: r * 2, height: r * 2, borderRadius: 999, background: 'rgba(138,108,247,.14)', border: '1.5px solid rgba(160,136,250,.7)', opacity: 1 - p, boxSizing: 'border-box' }} />;
					})}
					{ptrOn > 0 && <Hand x={ptr.x} y={ptr.y} press={press} opacity={Math.min(1, ptrOn) * typing} scale={1.9 / s} ibeam={ptr.ibeam} />}
				</div>
			)}

			{up > 0 && (
				<div style={{ position: 'absolute', left: phoneLeft - 14, top: phoneTop - 14, width: 390 * PS + 28, height: 844 * PS + 28, borderRadius: 62, background: '#1b1b21', boxShadow: '0 0 0 2px rgba(255,255,255,.14), 0 60px 160px rgba(0,0,0,.8), 0 0 220px rgba(138,108,247,.28)', transform: `rotate(${(1 - up) * 6}deg)` }}>
					<div style={{ position: 'absolute', left: 14, top: 14, width: 390 * PS, height: 844 * PS, borderRadius: 48, overflow: 'hidden' }}>
						<Picture pic={phone} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block' }} />
						{!finger.hidden && t > PHONE.in + 0.2 && <div style={{ position: 'absolute', left: (finger.x - 22) * PS, top: (finger.y - 22) * PS, width: 44 * PS, height: 44 * PS, borderRadius: 999, background: `rgba(255,255,255,${finger.down ? 0.5 : 0.2})`, border: `1.5px solid rgba(255,255,255,${finger.down ? 0.8 : 0.5})`, boxShadow: '0 4px 14px rgba(0,0,0,.4)', transform: `scale(${finger.down ? 0.85 : 1.12})`, boxSizing: 'border-box' }} />}
					</div>
				</div>
			)}

			{inWall && (
				<div style={{ position: 'absolute', inset: 0, opacity: 1 - Math.max(named * 0.84, said * 0.62), filter: named > 0 || said > 0 ? `blur(${Math.max(named * 10, said * 3)}px)` : undefined, transform: `perspective(2600px) rotateX(${back * 8}deg)` }}>
					{WALL_PICTURES.map((name, i) => {
						const col = i % COLS, row = Math.floor(i / COLS), far = Math.hypot(col - focus[0], row - focus[1]), p = i === 7 ? 1 : prog(t, WALL + 0.1 + far * 0.36, 0.7, out);
						return p > 0 && (
							<div key={i} style={{ position: 'absolute', left: 960 + (col * (PW + GAP) - wx) * ws, top: 540 + (row * (PH + GAP) - wy) * ws, width: PW * ws, height: PH * ws, borderRadius: 10 * ws, overflow: 'hidden', opacity: p, transform: `translateY(${(1 - p) * 60 * ws}px) scale(${mix(0.92, 1, p)})`, boxShadow: `0 0 0 1px rgba(255,255,255,.1), 0 ${30 * ws}px ${90 * ws}px rgba(0,0,0,.7)` }}>
								<Img src={i === 7 ? frame(film.lastDesk) : plate(name)} style={{ display: 'block', width: '100%', height: '100%' }} />
							</div>
						);
					})}
				</div>
			)}

			{film.captions.map((c, i) => <Caption key={i} {...c} />)}

			{/* the name */}
			{named > 0 && <>
				<div style={{ position: 'absolute', left: 0, right: 0, top: 232, display: 'flex', justifyContent: 'center', opacity: named, transform: `scale(${mix(1.2, 1, named)})` }}><Mark size={150} color={VIOLET} p={1 - prog(t, NAME + 0.3, 1.0, inOut)} /></div>
				<div style={{ position: 'absolute', left: 0, right: 0, top: 404, textAlign: 'center', fontSize: 190, fontWeight: 780, letterSpacing: '-0.045em', color: '#fff', opacity: named, transform: `translateY(${(1 - named) * 16}px)` }}>Binders</div>
				<div style={{ position: 'absolute', left: 0, right: 0, top: 672, textAlign: 'center', fontSize: 46, fontWeight: 520, letterSpacing: '-0.02em', color: 'rgba(255,255,255,.82)' }}><Words text="The best way to write a novel in Obsidian." at={44.98} step={0.05} /></div>
				<div style={{ position: 'absolute', left: 0, right: 0, top: 770, textAlign: 'center', fontSize: 36, fontWeight: 520, letterSpacing: '-0.015em', color: VIOLET }}><Words text="Built to feel native. Free in Community plugins." at={45.73} step={0.05} /></div>
			</>}
			<div style={{ position: 'absolute', inset: 0, background: '#000', opacity: gone }} />
		</div>
	);
};
