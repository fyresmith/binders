import type { Picture } from './model';

/* A picture's kind and size, read from its first bytes: what a writer needs to set it. PNG, JPEG and GIF, which every
   output takes; anything else is null (and is left out, with a warning). Pure. */

export function pictureOf(data: Uint8Array): Picture | null {
	const d = data, be = (at: number, n: number) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + (d[at + i] ?? 0); return v; };
	if (d.length > 24 && be(0, 4) === 0x89504e47 && be(4, 4) === 0x0d0a1a0a) return size(d, 'png', be(16, 4), be(20, 4));
	if (d.length > 10 && d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) return size(d, 'gif', d[6] + d[7] * 256, d[8] + d[9] * 256);
	if (d.length > 4 && d[0] === 0xff && d[1] === 0xd8) {
		// (the size is in the first "start of frame" segment; the segments before it are skipped by their lengths)
		for (let at = 2; at + 9 < d.length;) {
			if (d[at] !== 0xff) { at++; continue; }
			const marker = d[at + 1];
			if (marker === 0xff) { at++; continue; }
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return size(d, 'jpeg', be(at + 7, 2), be(at + 5, 2));
			if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += 2; continue; }
			at += 2 + be(at + 2, 2);
		}
	}
	return null;
}

const size = (data: Uint8Array, type: Picture['type'], width: number, height: number): Picture | null => (width > 0 && height > 0 ? { data, type, width, height } : null);

/** File name endings Obsidian shows as pictures. */
export const isPictureName = (name: string): boolean => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name.split('|')[0].split('#')[0].trim());
