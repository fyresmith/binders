import type { Patterns } from './hyphenate';
import { Hyphenator } from './hyphenate';
import de from './patterns/de';
import enGb from './patterns/en-gb';
import enUs from './patterns/en-us';
import es from './patterns/es';
import fr from './patterns/fr';
import it from './patterns/it';
import pt from './patterns/pt';

/* The hyphenation patterns Binders carries: TeX's own, from hyph-utf8 (github.com/hyphenation/tex-hyphen), a module
   a language in patterns/, each made by scripts/hyphenation-patterns.mjs from one file at one commit and each with
   its own copyright and licence at its head (all in THIRD-PARTY-NOTICES.md; the build keeps those heads in main.js).
   English (American, and British for every other English), German in the reformed spelling, French, Spanish,
   Italian and Portuguese: about 385 kB in all, German nearly two thirds of it. A book in any other language is set without
   hyphens: its lines are a little looser, and no word is broken wrongly. A language is added only if its licence
   lets it travel in an MIT plugin (the script says which do). */

const BY_LANGUAGE: Record<string, Patterns> = { en: enGb, 'en-us': enUs, 'en-ca': enUs, de, fr, es, it, pt };
const made = new Map<Patterns, Hyphenator>();

/** The hyphenator for a book's language, or null when Binders has no patterns for it. */
export function hyphenatorFor(language: string): Hyphenator | null {
	const tag = language.toLowerCase(), p = BY_LANGUAGE[tag] ?? BY_LANGUAGE[tag.slice(0, 2)];
	if (!p) return null;
	let h = made.get(p);
	if (!h) made.set(p, (h = new Hyphenator(p)));
	return h;
}
