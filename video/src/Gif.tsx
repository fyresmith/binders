// The listing's GIF: a few seconds of the take in gif-takes.mjs, no words, one framing, and a cross-fade at the end
// back to the first frame so it loops without a jump.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { direct } from './direction.mjs';
import TAKES from './gif-takes.json';
import { prog, inOut, useT } from './kit';

const T = TAKES as unknown as { W: number; H: number };
const frame = (i: number) => staticFile(`gif-takes/f${String(i).padStart(4, '0')}.jpg`);
const REST = (() => { const r = (TAKES as unknown as { acts: { name: string; x: number; y: number }[] }).acts.find((a) => a.name === 'rest'); return { x: r?.x ?? 720, y: r?.y ?? 430 }; })();
type Cue = { a: string; at: number; to?: number; dur?: number; pop?: boolean };
export type GifProps = { cues: Cue[]; length: number; fade: number; view: [number, number, number, number]; out: [number, number] };

/** The candidates. `view` is the part of the window shown (x, y, w, h in its points); `out` the render's size. */
export const GIFS: Record<string, GifProps> = {
	// the board and the explorer: The wreck put first, then the same scenes as one page
	GifPage: {
		length: 7.8, fade: 0.6, view: [40, 0, 1140, 620], out: [1760, 957],
		cues: [{ a: 'wreck-first', at: 0.9, to: 2.6 }, { a: 'mode-1', at: 3.5, pop: true }, { a: 'manuscript', at: 4.15 }, { a: 'read', at: 5.0, dur: 1.3 }],
	},
	// the same, and then the outliner and the timeline; back on the board The wreck is put back where it was, and the
	// pointer goes back to where it began: the last frame runs into the first, no fade
	GifModes: {
		length: 13.2, fade: 0, view: [40, 0, 1140, 620], out: [1760, 957],
		cues: [{ a: 'wreck-first', at: 0.7, to: 2.3 }, { a: 'mode-1', at: 3.0, pop: true }, { a: 'manuscript', at: 3.6 }, { a: 'read', at: 4.3, dur: 0.9 },
			{ a: 'mode-2', at: 5.7, pop: true }, { a: 'outliner', at: 6.3 }, { a: 'mode-3', at: 7.4, pop: true }, { a: 'timeline', at: 8.0 }, { a: 'mode-4', at: 9.1, pop: true }, { a: 'corkboard', at: 9.7 },
			{ a: 'wreck-back', at: 10.4, to: 11.9 }, { a: 'rest', at: 12.5 }],
	},
	// close on the board alone, larger: the drag, then the page
	GifClose: {
		length: 7.4, fade: 0.6, view: [296, 56, 884, 532], out: [1760, 1060],
		cues: [{ a: 'wreck-first', at: 0.9, to: 2.6 }, { a: 'mode-1', at: 3.5, pop: true }, { a: 'manuscript', at: 4.15 }, { a: 'read', at: 5.0, dur: 1.2 }],
	},
};

const Hand: React.FC<{ x: number; y: number; press: number; scale: number }> = ({ x, y, press, scale }) => (
	<svg width={32} height={32} viewBox="0 0 32 32" style={{ position: 'absolute', left: x - 3, top: y - 2, transformOrigin: '3px 2px', transform: `scale(${scale * (1 - press * 0.12)})`, filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.45))' }}>
		<path d="M3 2 L3 24.5 L9.2 18.9 L13.3 28.3 L17.4 26.5 L13.4 17.3 L21.6 17.1 Z" fill="#111114" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
	</svg>
);

/** The window as it is at `t`, with the pointer, in the window's points. */
const Scene: React.FC<{ film: ReturnType<typeof direct>; t: number; s: number; opacity?: number; length: number }> = ({ film, t, s, opacity = 1, length }) => {
	// (at rest the pointer drifts a little. A loop has to start and end on the same pixel: it is held still where it
	// rests until the first move begins, and drawn back to that place over the last second)
	const pic = film.picture('desk', t), raw = film.pointer(t), home = REST, k = prog(t, length - 0.8, 0.6, inOut);
	const rest = t <= 0.3 || k >= 1, ptr = rest ? { ...raw, x: home.x, y: home.y } : { ...raw, x: raw.x + (home.x - raw.x) * k, y: raw.y + (home.y - raw.y) * k };
	const press = [0, 0.015, 0.03, 0.045].reduce((n, d) => n + film.pointer(t - d).down / 4, 0);
	const layer: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: T.W, height: T.H, display: 'block' };
	return (
		<div style={{ position: 'absolute', inset: 0, opacity }}>
			<Img src={frame(pic.a)} style={layer} />
			{pic.k > 0 && pic.b !== pic.a && <Img src={frame(pic.b)} style={{ ...layer, opacity: pic.k }} />}
			{!ptr.hidden && <Hand x={ptr.x} y={ptr.y} press={press} scale={1.3 / s} />}
		</div>
	);
};

export const Gif: React.FC<GifProps> = ({ cues, length, fade, view, out }) => {
	const t = useT(), film = React.useMemo(() => direct(TAKES as never, cues as never, [REST.x, REST.y] as never), [cues]);
	const s = out[0] / view[2], back = fade > 0 ? prog(t, length - fade, fade, inOut) : 0;
	return (
		<div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#1e1e1e' }}>
			<div style={{ position: 'absolute', left: 0, top: 0, width: T.W, height: T.H, transformOrigin: '0 0', transform: `translate(${-view[0] * s}px, ${-view[1] * s}px) scale(${s})` }}>
				<Scene film={film} t={t} s={s} length={length} />
				{back > 0 && <Scene film={film} t={0} s={s} opacity={back} length={length} />}
			</div>
		</div>
	);
};
