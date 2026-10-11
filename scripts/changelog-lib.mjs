// The pure parts of ship, release and the changelog migration: reading CHANGELOG.md, adding to its Unreleased section,
// working out the next version by semantic versioning, turning Unreleased into a version, and finding a version's notes.
// Tested in tests/release.test.ts. (No import.meta here: the tests bundle this file.)

export const KINDS = ['Added', 'Changed', 'Fixed', 'Removed'];
export const INTRO = 'All notable changes to Binders. Versions follow [semantic versioning](https://semver.org): see AGENTS.md for when a number changes. Commits add entries under Unreleased (`npm run ship`); `npm run release` turns them into a version.';

// ---- versions ----
export const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const parseVersion = (v) => { const m = SEMVER.exec(String(v).trim()); if (!m) throw new Error(`"${v}" is not a version (x.y.z)`); return m.slice(1).map(Number); };
export const compareVersions = (a, b) => { const x = parseVersion(a), y = parseVersion(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
export const bump = (v, kind) => { const [M, m, p] = parseVersion(v); return kind === 'major' ? `${M + 1}.0.0` : kind === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`; };

/** The version a release is, by standard semantic versioning, from the last release and the Unreleased entries
    (`{ Added: [...], Fixed: [...] }`). Before 1.0.0 any Added, Changed or Removed entry is a minor bump and only Fixed
    is a patch. From 1.0.0 a breaking change is major but never inferred, only given (`breaking`); Added, Changed and
    Removed are minor, only Fixed is a patch. `as` sets the version by hand (1.0.0 is called that way); it has to be
    above the last release. Returns `{ version, kind, why }`. */
export function nextVersion(last, entries, { breaking = false, as = '' } = {}) {
	const count = (k) => (entries?.[k] ?? []).length;
	if (!KINDS.some(count)) throw new Error('There is nothing under Unreleased to release.');
	if (as) {
		parseVersion(as);
		if (compareVersions(as, last) <= 0) throw new Error(`--as ${as} is not above the last release, ${last}.`);
		return { version: as, kind: 'set', why: `set by hand with --as` };
	}
	const pre = parseVersion(last)[0] === 0, parts = KINDS.filter(count);
	if (breaking && !pre) return { version: bump(last, 'major'), kind: 'major', why: 'a breaking change, given with --breaking' };
	const feature = ['Added', 'Changed', 'Removed'].filter(count);
	if (feature.length) return { version: bump(last, 'minor'), kind: 'minor', why: `${feature.join(' and ')} entries${pre ? ' (before 1.0.0, any of them is a minor change)' : ''}${breaking && pre ? '; --breaking means nothing before 1.0.0' : ''}` };
	return { version: bump(last, 'patch'), kind: 'patch', why: `only ${parts.join(' and ')} entries` };
}

// ---- the file ----
/** A changelog as its text before the first `## ` heading and its sections, each `{ title, raw }`; `raw` is the section
    as written, from its heading to just before the next. */
export function parseChangelog(text) {
	const lines = text.split('\n'), starts = [];
	lines.forEach((l, i) => { if (/^## /.test(l)) starts.push(i); });
	const head = lines.slice(0, starts[0] ?? lines.length).join('\n');
	const sections = starts.map((s, k) => { const raw = lines.slice(s, starts[k + 1] ?? lines.length).join('\n'); return { title: lines[s].slice(3).trim(), raw }; });
	return { head, sections };
}
/** The text of a changelog again: the head, then each section, a blank line between and one newline at the end. */
export function renderChangelog({ head, sections }) {
	return [head.replace(/\s+$/, ''), ...sections.map((s) => s.raw.replace(/\s+$/, ''))].join('\n\n') + '\n';
}

/** The entries of a section's body, `{ Added: ['…'], … }` (a bullet that goes on over several lines keeps them). */
export function parseEntries(raw) {
	const out = {};
	let kind = null, cur = null;
	for (const line of raw.split('\n').slice(1)) {
		const h = /^### (.+?)\s*$/.exec(line);
		if (h) { kind = h[1]; cur = null; continue; }
		if (!kind) continue;
		if (/^- /.test(line)) { cur = line.slice(2); (out[kind] ||= []).push(cur); continue; }
		if (cur !== null && line.trim()) out[kind][out[kind].length - 1] += '\n' + line;
	}
	return out;
}
/** Entries as a section's body: Added, Changed, Fixed, Removed (others after), each a list. */
export function renderEntries(entries) {
	const kinds = [...KINDS.filter((k) => entries[k]?.length), ...Object.keys(entries).filter((k) => !KINDS.includes(k) && entries[k]?.length)];
	return kinds.map((k) => `### ${k}\n\n${entries[k].map((e) => `- ${e}`).join('\n')}`).join('\n\n');
}
const section = (title, entries) => ({ title, raw: `## ${title}\n\n${renderEntries(entries)}` });
const isUnreleased = (s) => s.title === 'Unreleased';
const versionOf = (s) => (SEMVER.exec(s.title.split(' ')[0]) ? s.title.split(' ')[0] : null);

/** The Unreleased entries of a changelog, or null when there is no such section. */
export function unreleasedOf(text) {
	const u = parseChangelog(text).sections.find(isUnreleased);
	return u ? parseEntries(u.raw) : null;
}
export const hasEntries = (entries) => !!entries && Object.values(entries).some((l) => l.length);

/** The changelog with `notes` (`{ added: ['…'], fixed: [...] }`, lower case) added to the end of each kind's list in
    Unreleased, which is made at the top if it is not there: entries stay in the order they were made. */
export function addUnreleased(text, notes) {
	const log = parseChangelog(text), at = log.sections.findIndex(isUnreleased);
	const entries = at >= 0 ? parseEntries(log.sections[at].raw) : {};
	for (const k of KINDS) if (notes[k.toLowerCase()]?.length) entries[k] = [...(entries[k] ?? []), ...notes[k.toLowerCase()]];
	const next = section('Unreleased', entries);
	if (at >= 0) log.sections[at] = next; else log.sections.unshift(next);
	return renderChangelog(log);
}

/** Unreleased becomes `## version (date)`; the entries already grouped and in the order the commits were made. */
export function applyRelease(text, version, date) {
	const log = parseChangelog(text), at = log.sections.findIndex(isUnreleased);
	if (at < 0 || !hasEntries(parseEntries(log.sections[at].raw))) throw new Error('There is nothing under Unreleased to release.');
	if (log.sections.some((s) => versionOf(s) === version)) throw new Error(`CHANGELOG.md already has a section for ${version}.`);
	log.sections[at] = section(`${version} (${date})`, parseEntries(log.sections[at].raw));
	return renderChangelog(log);
}

/** The notes of one version: its section of the changelog, heading and all. The same as the `awk` in release.yml
    (which tests/release.test.ts runs on the same changelogs and compares). */
export function notesOf(text, version) {
	const s = parseChangelog(text).sections.find((x) => x.title === version || x.title.startsWith(version + ' '));
	return s ? s.raw.replace(/\s+$/, '') + '\n' : '';
}

// ---- the one-time migration to "versions change only at a release" ----
const INTERNAL_TEXT = [
	[/^nothing you will notice/i, 'says nothing changed for a writer'],
	[/\broadmap\b/i, 'about the roadmap'],
	[/\b(the readme|readme\b|the manual\b|list of limitations|known limitations)/i, 'about the README, the manual or the limitations'],
	[/\bscreenshots? folder\b/i, 'pictures for the listing'],
	[/^(docs?|tests?|tooling)\b/i, 'docs, tests or tooling'],
];
const INTERNAL_TITLE = /^(docs?|roadmap|tests?|tooling|screenshots?)\b/i;
/** Why an entry is plainly internal (docs, roadmap, tests, tooling), or '' when it is not. `title` is its commit's title
    without the version, when known. */
export function internalWhy(text, title = '') {
	if (INTERNAL_TITLE.test(title)) return `commit "${title}"`;
	for (const [re, why] of INTERNAL_TEXT) if (re.test(text)) return why;
	return '';
}

/** Folds every section above the last release into one Unreleased, in the order the commits were made (the file has the
    newest first), grouped, without the plainly internal entries. `titles` maps a version to its commit's title.
    Returns `{ text, dropped, folded }`; with nothing to fold (or a lone Unreleased already), the text as it was. */
export function migrate(text, { last, titles = {}, intro = true } = {}) {
	const log = parseChangelog(text), at = log.sections.findIndex((s) => versionOf(s) === last);
	if (at < 0) throw new Error(`CHANGELOG.md has no section for the last release, ${last}.`);
	const above = log.sections.slice(0, at);
	if (!above.length || (above.length === 1 && isUnreleased(above[0]))) return { text: introFixed(text, intro), dropped: [], folded: [] };
	const entries = {}, dropped = [], folded = [];
	for (const s of [...above].reverse()) {
		const v = versionOf(s);
		if (v) folded.push(v);
		const title = v ? titles[v] ?? '' : '';
		for (const [kind, list] of Object.entries(parseEntries(s.raw))) for (const e of list) {
			const why = v ? internalWhy(e, title) : '';
			if (why) dropped.push({ version: v, kind, text: e, why }); else (entries[kind] ||= []).push(e);
		}
	}
	log.sections = [...(hasEntries(entries) ? [section('Unreleased', entries)] : []), ...log.sections.slice(at)];
	return { text: introFixed(renderChangelog(log), intro), dropped, folded };
}
function introFixed(text, on) {
	if (!on) return text;
	const log = parseChangelog(text);
	log.head = log.head.replace(/All notable changes to Binders\.[\s\S]*?(?=\n\s*$|$)/, INTRO);
	return renderChangelog(log);
}

/** Folds the long run of per-commit sections between releases under each release's own heading (opt-in; git can undo
    it). `releases` are the tagged versions. A section of a version above the last release is left alone. */
export function foldReleased(text, releases) {
	const log = parseChangelog(text), rel = [...releases].sort(compareVersions);
	const out = [];
	const used = new Set();
	for (const s of log.sections) {
		const v = versionOf(s);
		if (!v) { out.push(s); continue; }
		// the release this version belongs to: the first at or above it
		const r = rel.find((x) => compareVersions(x, v) >= 0);
		if (!r || r === v) { out.push(s); continue; }
		used.add(s);
	}
	for (const s of out) {
		const v = versionOf(s);
		if (!v || !rel.includes(v)) continue;
		const p = rel[rel.indexOf(v) - 1] ?? '0.0.0';
		const parts = log.sections.filter((x) => used.has(x) && compareVersions(versionOf(x), p) > 0 && compareVersions(versionOf(x), v) < 0).reverse();
		if (!parts.length) continue;
		const entries = {};
		for (const x of [...parts, s]) for (const [kind, list] of Object.entries(parseEntries(x.raw))) (entries[kind] ||= []).push(...list);
		Object.assign(s, section(s.title, entries));
	}
	log.sections = out;
	return renderChangelog(log);
}
