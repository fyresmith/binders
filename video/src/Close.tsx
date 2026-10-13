// How the film ends: the rest of what Binders does, around one line; what a scene is on disk; the real thing in
// Obsidian; the name.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { back, C, Caption, clamp01, FONT, Headline, inOut, Mark, mix, prog, Shot, useT, Words } from './kit';

// ---- everything else, in orbit ----
export const ORBIT_LENGTH = 6.2;
const TOOLS: [string, string][] = [
	['Snapshots', 'violet'], ['Find and replace', 'blue'], ['Focus mode', 'green'], ['Split and merge', 'orange'], ['Word targets', 'violet'], ['Import from Scrivener', 'red'], ['Export to EPUB', 'blue'],
	['Print-ready PDF', 'orange'], ['Undo and redo', 'green'], ['Import from Word', 'blue'], ['Labels and statuses', 'red'], ['Longform projects', 'violet'], ['Phones and tablets', 'green'], ['Arrange by label', 'orange'],
];
export const Orbit: React.FC = () => {
	const t = useT();
	return (
		<Shot length={ORBIT_LENGTH}>
			{TOOLS.map(([name, color], i) => {
				// two rings, the far one smaller and softer; all of it turning slowly
				const far = i % 2 === 1, angle = (i / TOOLS.length) * Math.PI * 2 + t * 0.085 + (far ? 0.12 : 0);
				const rx = far ? 830 : 640, ry = far ? 455 : 345, p = prog(t, 0.9 + ((i * 5) % TOOLS.length) * 0.07, 0.9, back), gone = prog(t, ORBIT_LENGTH - 0.9, 0.5);
				const x = 960 + Math.cos(angle) * rx * mix(0.82, 1, p) * (1 + gone * 0.12), y = 540 + Math.sin(angle) * ry * mix(0.82, 1, p) * (1 + gone * 0.12), s = far ? 0.8 : 1;
				return (
					<div key={i} style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${s * mix(0.6, 1, p)})`, opacity: clamp01(p * 1.3) * (far ? 0.72 : 1) * (1 - gone), filter: far ? 'blur(1.6px)' : undefined, display: 'flex', alignItems: 'center', gap: 14, padding: '15px 24px 15px 20px', borderRadius: 16, background: '#fff', border: `1.5px solid ${C.line}`, boxShadow: '0 14px 34px rgba(30,25,70,.10)', fontSize: 31, fontWeight: 540, letterSpacing: '-0.015em', color: C.ink, whiteSpace: 'nowrap' }}>
						<span style={{ width: 14, height: 14, borderRadius: 4.5, background: (C as Record<string, string>)[color] }} />{name}
					</div>
				);
			})}
			<div style={{ position: 'absolute', left: 0, right: 0, top: 540, transform: 'translateY(-50%)', textAlign: 'center', fontFamily: FONT, fontSize: 84, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.12, color: C.ink }}>
				<Words text={'And the tools a\n*long* *book* needs.'} at={0.25} gone={ORBIT_LENGTH - 0.9} />
			</div>
		</Shot>
	);
};

// ---- plain files ----
export const PLAIN_LENGTH = 6;
const MONO = '"JetBrains Mono", "CaskaydiaMono Nerd Font", ui-monospace, "DejaVu Sans Mono", monospace';
const NOTE: [string, string?][] = [['---'], ['synopsis', 'The supply boat leaves Mara on the jetty.'], ['status', 'Revised'], ['label', 'Blue'], ['target', '2000'], ['---'], [''], ['The supply boat left Mara on the jetty with'], ['two cases and a letter she had not opened.']];
export const Plain: React.FC = () => {
	const t = useT(), rise = prog(t, 1.6, 0.9), push = prog(t, 1.6, 4.2, inOut);
	return (
		<Shot length={PLAIN_LENGTH}>
			<Headline text="Every word stays *plain* *Markdown.*" at={0.2} dock={1.25} gone={5.4} />
			<Caption text="Turn Binders off, and your notes are still your notes." at={2.9} gone={5.4} />
			<div style={{ position: 'absolute', left: 400, top: 268 + (1 - rise) * 60, width: 1120, height: 600, borderRadius: 22, background: '#fff', border: `1.5px solid ${C.line}`, boxShadow: '0 30px 80px rgba(30,25,70,.10)', opacity: rise, overflow: 'hidden', transform: `scale(${mix(1, 1.035, push)})` }}>
				<div style={{ height: 62, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: `1.5px solid ${C.line}`, background: C.panel, fontSize: 23, color: C.soft }}>
					<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
					The Lighthouse / Part One / <span style={{ color: C.ink, fontWeight: 560 }}>Arrival.md</span>
				</div>
				<div style={{ padding: '34px 40px', fontFamily: MONO, fontSize: 30, lineHeight: 1.72, color: C.ink, whiteSpace: 'pre' }}>
					{NOTE.map(([a, b], i) => {
						const p = prog(t, 1.95 + i * 0.11, 0.6);
						return <div key={i} style={{ height: '1.72em', opacity: p, transform: `translateX(${(1 - p) * -14}px)` }}>{b == null ? <span style={{ color: a === '---' ? C.faint : C.ink }}>{a}</span> : <><span style={{ color: C.deep }}>{a}</span><span style={{ color: C.faint }}>: </span>{b}</>}</div>;
					})}
				</div>
			</div>
		</Shot>
	);
};

// ---- the real thing ----
export const FRAMED_LENGTH = 5;
export const Framed: React.FC = () => {
	const t = useT(), rise = prog(t, 0.3, 1.2), push = prog(t, 0.3, 4.7, inOut), SW = 1290, SH = SW * 1800 / 2880;
	return (
		<Shot length={FRAMED_LENGTH} bg={`radial-gradient(120% 90% at 20% 0%, #9b82f7 0%, ${C.deep} 45%, #4a32b3 100%)`}>
			<div style={{ position: 'absolute', left: 0, right: 0, top: 78, textAlign: 'center', fontSize: 54, fontWeight: 650, letterSpacing: '-0.03em', color: '#fff' }}><Words text="Right where you already write." at={0.4} gone={4.5} /></div>
			<div style={{ position: 'absolute', left: (1920 - SW) / 2, top: 196 + (1 - rise) * 120, width: SW, height: SH, borderRadius: 18, overflow: 'hidden', opacity: clamp01(rise * 1.5), transformOrigin: '50% 20%', transform: `scale(${mix(0.97, 1.03, push)})`, boxShadow: '0 0 0 1px rgba(20,10,60,.4), 0 50px 120px rgba(20,8,70,.5)' }}>
				<Img src={staticFile('corkboard.png')} style={{ display: 'block', width: '100%' }} />
			</div>
		</Shot>
	);
};

// ---- the name ----
export const END_LENGTH = 5.2;
export const End: React.FC = () => {
	const t = useT(), m = prog(t, 0.3, 0.9, back), slide = prog(t, 0.7, 1.1, inOut);
	return (
		<Shot length={END_LENGTH} leave={0.6}>
			<div style={{ position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center', opacity: clamp01(m * 1.4), transform: `scale(${mix(0.7, 1, m)})` }}><Mark size={150} p={1 - slide} /></div>
			<div style={{ position: 'absolute', left: 0, right: 0, top: 478, textAlign: 'center', fontSize: 132, fontWeight: 700, letterSpacing: '-0.045em', color: C.ink }}><Words text="Binders" at={1.0} /></div>
			<div style={{ position: 'absolute', left: 0, right: 0, top: 650, textAlign: 'center', fontSize: 40, fontWeight: 500, letterSpacing: '-0.015em', color: C.soft }}><Words text="for Obsidian" at={1.45} /></div>
			<div style={{ position: 'absolute', left: 0, right: 0, top: 820, textAlign: 'center', fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em', color: C.faint }}><Words text="Find it in Community plugins." at={2.2} step={0.05} /></div>
		</Shot>
	);
};
