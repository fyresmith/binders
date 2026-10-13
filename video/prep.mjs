// Copies what the film borrows from the project into public/ (ignored by git): the banner's Inter and one real
// screenshot from the listing. Run before a render, so the film always shows the current pictures.
import { cpSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..'), pub = join(here, 'public');
mkdirSync(pub, { recursive: true });
cpSync(join(root, 'scripts/banner/fonts/Inter-latin-variable.woff2'), join(pub, 'Inter.woff2'));
cpSync(join(root, 'screenshots/desktop-1-corkboard.png'), join(pub, 'corkboard.png'));
// the tracks, if they are here (music/ is not in git: a track is licensed by whoever publishes the film)
if (existsSync(join(here, 'music'))) cpSync(join(here, 'music'), join(pub, 'music'), { recursive: true });
