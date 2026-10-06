/* A font file, as the build puts it inside main.js: its bytes in base64 (esbuild.config.mjs). */
declare module '*.woff2' {
	const base64: string;
	export default base64;
}
