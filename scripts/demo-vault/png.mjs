// Small pictures made by drawing them: a canvas of pixels with rectangles and lines, written out as a PNG. So the
// example books have real images of a real size without a file of bytes typed into the source. Pure.
import { deflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8);
	out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

/** A canvas `w` by `h` pixels, filled with one color ([r, g, b]). */
export function picture(w, h, bg = [255, 255, 255]) {
	const px = Buffer.alloc(w * h * 3);
	for (let i = 0; i < w * h; i++) px.set(bg, i * 3);
	const dot = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) px.set(c, (Math.round(y) * w + Math.round(x)) * 3); };
	const self = {
		/** A filled rectangle. */
		rect(x, y, rw, rh, c) { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) dot(i, j, c); return self; },
		/** A rectangle's outline, `t` pixels thick. */
		frame(x, y, rw, rh, c, t = 2) { return self.rect(x, y, rw, t, c).rect(x, y + rh - t, rw, t, c).rect(x, y, t, rh, c).rect(x + rw - t, y, t, rh, c); },
		/** A line, `t` pixels thick; `dash` pixels on and off if given. */
		line(x0, y0, x1, y1, c, t = 2, dash = 0) {
			const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
			for (let i = 0; i <= n; i++) { if (dash && Math.floor(i / dash) % 2) continue; const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) dot(x + a, y + b, c); }
			return self;
		},
		/** The PNG's bytes (8-bit RGB). */
		png() {
			const raw = Buffer.alloc((w * 3 + 1) * h);
			for (let y = 0; y < h; y++) px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
			const head = Buffer.alloc(13);
			head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head.set([8, 2, 0, 0, 0], 8);
			return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
		},
	};
	return self;
}
