/* A manuscript's typeface. The Word file names whatever the style says and Word uses it if the reader's computer has
   it; the pages (the PDF, and the preview) can only use a font they carry or that this computer has, and are set in
   the nearest of two stand-ins otherwise: a monospaced name in Courier, any other in Times. Pure.
   docs/export-styles.md, "A manuscript style's rows". */

/** The two that every computer with Word has; the pages stand in for them with what a computer has by another name. */
export const TIMES = 'Times New Roman', COURIER = 'Courier New';
/** The one more that travels in the plugin (pages/fonts.ts), so the PDF has it whatever this computer has. */
export const COURIER_PRIME = 'Courier Prime';

const TIMES_STACK = '"Times New Roman", Tinos, "Liberation Serif", Times, serif';
const COURIER_STACK = '"Courier New", "Courier Prime", Cousine, "Liberation Mono", monospace';

/** Whether a font's name says it is monospaced (a typewriter's face): Courier Prime, Cousine, JetBrains Mono... */
export const isMono = (name: string): boolean => /courier|mono|typewriter|consolas|menlo|cousine|fixed|terminal|\bcode\b/i.test(name);

/** Whether the pages need nothing but their stand-ins for it: one of the two every computer has. */
export const isStandard = (name: string): boolean => name === TIMES || name === COURIER;

/** A name as the stylesheet can hold it inside quotes. */
const quoted = (name: string): string => `"${name.replace(/["\\;{}<>\r\n]/g, '').trim()}"`;

/** The pages' `font-family` for a typeface: the name first, then what stands in for it. */
export function manuscriptFamily(typeface: string): string {
	if (typeface === TIMES) return TIMES_STACK;
	if (typeface === COURIER) return COURIER_STACK;
	return `${quoted(typeface)}, ${isMono(typeface) ? COURIER_STACK : TIMES_STACK}`;
}

/** What the window says when the pages can't be set in a typeface this computer doesn't have. */
export function fallbackWarning(typeface: string): string {
	const name = typeface.replace(/\s+/g, ' ').trim();
	return `“${name}” isn’t on this computer, so the PDF is set in ${isMono(name) ? 'Courier' : 'Times'} instead. The Word file still names “${name}”, and Word uses it where it is installed.`;
}
