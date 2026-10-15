// The films. "Preview" is the one that is shown: an evening's work in the real app (Film.tsx). "Classic" is the first
// of all, on white, with the app redrawn; it keeps each shot's own time, in seconds from its start.
import React from 'react';
import { AbsoluteFill, Composition, Series } from 'remotion';
import { Book, BOOK_LENGTH } from './Book';
import { End, END_LENGTH, Framed, FRAMED_LENGTH, Orbit, ORBIT_LENGTH, Plain, PLAIN_LENGTH } from './Close';
import { Film, FILM_LENGTH } from './Film';
import { Gif, GIFS } from './Gif';
import { C, H, W } from './kit';

const FPS = 60;
const SHOTS: [React.FC, number][] = [[Book, BOOK_LENGTH], [Orbit, ORBIT_LENGTH], [Plain, PLAIN_LENGTH], [Framed, FRAMED_LENGTH], [End, END_LENGTH]];
const total = SHOTS.reduce((n, [, s]) => n + s, 0);

const Classic: React.FC = () => (
	<AbsoluteFill style={{ background: C.bg }}>
		<Series>{SHOTS.map(([Part, seconds], i) => <Series.Sequence key={i} durationInFrames={Math.round(seconds * FPS)}><Part /></Series.Sequence>)}</Series>
	</AbsoluteFill>
);

export const Root: React.FC = () => (<>
	<Composition id="Preview" component={Film} width={W} height={H} fps={FPS} durationInFrames={Math.round(FILM_LENGTH * FPS)} />
	<Composition id="Classic" component={Classic} width={W} height={H} fps={FPS} durationInFrames={Math.round(total * FPS)} />
	{Object.entries(GIFS).map(([id, g]) => <Composition key={id} id={id} component={Gif} width={g.out[0]} height={g.out[1]} fps={30} durationInFrames={Math.round(g.length * 30)} defaultProps={g} />)}
</>);
