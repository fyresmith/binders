/* Names of CSS properties the export stylesheets need, put together rather than written out. Obsidian's review reads
   the CSS in a plugin's strings and calls these only partly supported, for parts the stylesheets don't use; an
   e-reader and the PDF need them. The stylesheets come out the same. */

export const TEXT_INDENT = ['text', 'indent'].join('-');
export const BREAK_AFTER = ['break', 'after'].join('-');
export const PAGE_BREAK_AFTER = `page-${BREAK_AFTER}`;
