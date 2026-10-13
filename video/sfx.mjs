// The film's sounds. The clicks and the keys are recordings of a real mouse and a real keyboard, both given to the
// public domain (CC0) by the people who made them:
//   the mouse: "Middle Mouse Click" by 1j01, a press and a release (opengameart.org/content/middle-mouse-click)
//   the keys: "Keyboard Soundpack #1" by unicaegames, single presses of a Cherry KC 1000
//             (opengameart.org/content/keyboard-soundpack-1-typing-and-single-keystrokes)
// `node sfx.mjs` fetches them into sounds/download (not in git), sets each to a quiet level and writes what the film
// plays to public/sfx. The few sounds that are not a mouse or a keyboard are made here, and kept low: a brush as
// something lifts, a soft tap as it lands, a wheel's tick, air for a camera move.
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url)), src = join(here, 'sounds/download'), out = join(here, 'public/sfx');
mkdirSync(src, { recursive: true });
mkdirSync(out, { recursive: true });
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status) { console.error(r.stderr); process.exit(r.status); } return r; };
const fetched = (file, url) => { if (!existsSync(join(src, file))) run('curl', ['-sfL', '-m', '180', '-A', 'Mozilla/5.0', '-o', join(src, file), url]); };
fetched('click-press.wav', 'https://opengameart.org/sites/default/files/middle-click-press.wav');
fetched('click-release.wav', 'https://opengameart.org/sites/default/files/middle-click-release.wav');
fetched('keys.zip', 'https://opengameart.org/sites/default/files/unicae_games_keyboard_soundpack_1_0.zip');
if (!existsSync(join(src, 'keys/Single Keys'))) run('unzip', ['-q', '-o', join(src, 'keys.zip'), 'Single Keys/*', '-d', join(src, 'keys')]);

/** A recording, set so that its loudest moment is at `peak` dB, with any filters after that. */
const sample = (name, file, peak, filters = '') => {
	const max = Number(/max_volume: ([-0-9.]+) dB/.exec(run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']).stderr)?.[1] ?? 0);
	run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-ac', '2', '-ar', '48000', '-af', `volume=${(peak - max).toFixed(1)}dB${filters ? ',' + filters : ''}`, join(out, `${name}.wav`)]);
};
const key = (n) => join(src, 'keys/Single Keys', `keypress-${String(n).padStart(3, '0')}.wav`);
sample('click', join(src, 'click-press.wav'), -13);
sample('click-up', join(src, 'click-release.wav'), -17);
[3, 7, 11, 14, 18, 22, 26, 30].forEach((n, i) => sample(`key${i + 1}`, key(n), -17));
sample('space', key(9), -15, 'asetrate=48000*0.82,aresample=48000'); // (a space bar is the same key, deeper)
sample('phone-key', key(5), -27, 'asetrate=48000*1.25,aresample=48000,highpass=f=500'); // (a phone's keys: barely there)
sample('tap', join(src, 'click-release.wav'), -26, 'lowpass=f=1800'); // (a finger on glass)

const made = (name, input, af) => run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', input, '-af', af, join(out, `${name}.wav`)]);
made('drop', `aevalsrc='exp(-t/0.04)*sin(2*PI*(60*t+30*0.05*(1-exp(-t/0.05))))':d=0.11:s=48000`, 'highpass=f=50,afade=t=out:st=0.08:d=0.03,volume=-17dB');
made('tick', `aevalsrc='exp(-t/0.003)*(0.4*sin(2*PI*900*t)+0.5*(random(0)*2-1))':d=0.012:s=48000`, 'highpass=f=700,lowpass=f=5000,volume=-26dB');
made('brush', 'anoisesrc=c=pink:d=0.12:r=48000:a=0.5', 'bandpass=f=1100:width_type=o:w=1.5,afade=t=in:d=0.05:curve=qsin,afade=t=out:st=0.05:d=0.07:curve=qsin,volume=-20dB');
made('air', 'anoisesrc=c=pink:d=0.7:r=48000:a=0.5', 'bandpass=f=700:width_type=o:w=1.5,afade=t=in:d=0.3:curve=qsin,afade=t=out:st=0.3:d=0.4:curve=qsin,volume=-24dB');
console.log(`sounds in ${out}`);
