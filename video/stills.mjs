// Frames of the film at the seconds given, for looking at a shot without rendering all of it:
//   node stills.mjs out/stills 0.5 2 4.5 [--scale 0.5]
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), at = args.indexOf('--scale'), scale = at < 0 ? 0.5 : Number(args.splice(at, 2)[1]);
const [dir, ...seconds] = args;
mkdirSync(dir, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(here, 'src/index.ts'), publicDir: join(here, 'public') });
const composition = await selectComposition({ serveUrl, id: 'Preview' });
for (const [i, s] of seconds.entries()) {
	const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
	await renderStill({ composition, serveUrl, frame, scale, imageFormat: 'jpeg', jpegQuality: 88, output: join(dir, `${String(i).padStart(3, '0')}.jpg`) });
}
console.log(`${seconds.length} frames in ${dir}`);
