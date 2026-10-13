// A contact sheet of the take: the last picture of each thing done (or the ones named), for a look before a cut.
//   node sheet.mjs [name ...]   ->  out/take-sheet.jpg
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const { acts } = JSON.parse(readFileSync(join(here, 'src/takes.json'), 'utf8'));
const want = process.argv.slice(2);
const last = (a) => a.after?.length ? a.after[a.after.length - 1][0] : a.keys?.length ? a.keys[a.keys.length - 1] : a.hover;
const picked = acts.filter((a) => !want.length || want.includes(a.name));
const args = ['-v', 'error', '-y'];
for (const a of picked) args.push('-i', join(here, 'public/takes', `f${String(last(a)).padStart(4, '0')}.jpg`));
const cols = Math.min(6, picked.length), rows = Math.ceil(picked.length / cols);
const scaled = picked.map((a, i) => `[${i}]scale=520:324:force_original_aspect_ratio=decrease,pad=524:328:(ow-iw)/2:0:color=0x333333,setsar=1,drawtext=text='${a.name}':x=6:y=h-26:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.7[v${i}]`).join(';');
args.push('-filter_complex', `${scaled};${picked.map((_, i) => `[v${i}]`).join('')}concat=n=${picked.length}:v=1:a=0,tile=${cols}x${rows}:padding=3:color=0x666666`, '-frames:v', '1', join(here, 'out/take-sheet.jpg'));
process.exit(spawnSync('ffmpeg', args, { stdio: 'inherit' }).status ?? 1);
