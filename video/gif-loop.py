# The seamless clip (GifModes) from its PNG frames (npx remotion render src/index.ts GifModes out/gif/seq --sequence
# --image-format=png): a GIF (ffmpeg, one palette, ordered dither so an unchanged pixel stays unchanged) and an
# animated WebP (Pillow, lossy, its last frame a key frame so it equals the first), 880 wide,
# 20 fps. Then it checks the first frame against the last in each.
#   python3 -I gif-loop.py
import glob, os, subprocess
from PIL import Image, ImageChops, ImageSequence

here = os.path.dirname(os.path.abspath(__file__))
d = os.path.join(here, 'out', 'gif')
src = sorted(glob.glob(os.path.join(d, 'seq', 'element-*.png')))
n = len(src) * 20 // 30
picks = [src[min(len(src) - 1, (k * 30) // 20)] for k in range(n)]
w = 880
frames = []
for p in picks:
	im = Image.open(p).convert('RGB')
	frames.append(im.resize((w, round(im.height * w / im.width)), Image.LANCZOS))
gif, webp = os.path.join(d, 'GifModes-880.gif'), os.path.join(d, 'GifModes-880.webp')
# (the encoder merges a run of equal frames into one; the last of what is left is made a key frame, coded on its own
# like the first, so it comes out as the first did and not as a lossy change from the frame before it)
distinct = 1 + sum(1 for a, b in zip(frames, frames[1:]) if ImageChops.difference(a, b).getbbox())
frames[0].save(webp, save_all=True, append_images=frames[1:], duration=50, loop=0, quality=82, method=6, kmin=distinct - 2, kmax=distinct - 1)
lst = os.path.join(d, 'seq20.txt')
with open(lst, 'w') as f:
	for p in picks: f.write(f"file '{p}'\nduration 0.05\n")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', f'scale={w}:{frames[0].height}:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-r', '20', '-loop', '0', gif], check=True)
for f in (gif, webp):
	im = Image.open(f)
	fr = [x.convert('RGB') for x in ImageSequence.Iterator(im)]
	diff = ImageChops.difference(fr[0], fr[-1]).convert('L')
	print(os.path.basename(f), f'{os.path.getsize(f) / 1e6:.2f} MB', f'{im.width}x{im.height}', len(fr), 'frames', 'first/last diff:', diff.getbbox(), 'max', diff.getextrema()[1])
