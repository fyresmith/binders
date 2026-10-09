import { StreamLanguage, type Language } from '@codemirror/language';
import { wrapMode, type ModeState } from './mode';

/* Undocumented, with mode.ts: Obsidian's editor reads Markdown with a stream language made from its HyperMD mode. Here
   that language is made again from the mode as mode.ts wraps it. (`StreamLanguage` and its `streamParser` are
   CodeMirror's public API; that Obsidian's Markdown is one, and what its mode's state holds, is not.) */

const made = new WeakMap<Language, Language | null>(), ours = new WeakSet<Language>();

/** The editor's own language with a line begun by a tab read as a paragraph, or null where this Obsidian's language
    isn't the one known here (then nothing changes: such lines stay code). */
export function proseLanguage(base: Language | null): Language | null {
	if (!base) return null;
	if (made.has(base)) return made.get(base) ?? null;
	let lang: Language | null = null;
	try {
		const mode = base instanceof StreamLanguage ? wrapMode((base as StreamLanguage<ModeState>).streamParser) : null;
		lang = mode ? StreamLanguage.define(mode) : null;
		if (lang) ours.add(lang);
	} catch { lang = null; }
	made.set(base, lang);
	return lang;
}

/** Is this a language made here, or one that one can be made from? (Then a tab line is, or will be, read as a
    paragraph.) */
export const readable = (lang: Language | null): boolean => !!lang && (ours.has(lang) || !!proseLanguage(lang));

/** Forgets what was made of a language, so it is looked at again (for a test that changes the mode under it). */
export function forget(base: Language | null): void { if (base) made.delete(base); }
