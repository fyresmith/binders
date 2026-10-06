import de from 'hyphenation.de';
import enGb from 'hyphenation.en-gb';
import enUs from 'hyphenation.en-us';
import es from 'hyphenation.es';
import fr from 'hyphenation.fr';
import it from 'hyphenation.it';
import pt from 'hyphenation.pt';
import { Hyphenator, type Patterns } from './hyphenate';

/* The hyphenation patterns Binders carries: TeX's, as the `hyphenation.*` packages pack them (about 190 kB in all).
   English (American, and British for every other English), German, French, Spanish, Italian and Portuguese. A book
   in any other language is set without hyphens: its lines are a little looser, and no word is broken wrongly. */

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
