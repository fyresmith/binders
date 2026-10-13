# The preview film

A film of Binders in use, made in code. It is not part of the plugin and has its own dependencies (Remotion).

- `editions/`: the finished films. Edition 1 is in the manual's small example book; edition 2 is the same evening
  in the listing's book, a novel half written.
- `STORYBOARD.md`: what happens in each second, and why.
- `takes.mjs`: the evening's work, done in the real app (headless Obsidian, a throwaway vault) and photographed.
- `src/direction.mjs`: when each thing happens, and from that the pointer, the keys, the camera, the captions and
  the sounds. `node check.mjs` reads the cut back and says where a hand could not keep up.
- `src/Film.tsx`: draws it.

To make it again, from the project's folder:

```bash
npm run build && npm run install-vault
cd video && npm install
node plates.mjs            # the app's pictures and the take (add --full for the listing's book)
node sfx.mjs               # the sounds
npm run render             # out/binders-preview.mp4
```

Not in git: the pictures and the take (`public/`, `src/takes.json`), the sounds (`sounds/`, fetched by `sfx.mjs`)
and the track (`music/little-alicia.mp3`: "Little Alicia" by White_Records, which whoever publishes the film must
have the right to use).

The clicks and the keys are recordings given to the public domain (CC0): "Middle Mouse Click" by 1j01 and
"Keyboard Soundpack #1" by unicaegames, both from opengameart.org.
