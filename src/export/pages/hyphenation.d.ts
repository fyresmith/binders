/* The `hyphenation.*` packages: TeX's hyphenation patterns, a language each, without types of their own. */
declare module 'hyphenation.*' {
	const patterns: import('./hyphenate').Patterns;
	export default patterns;
}
