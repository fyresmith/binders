// The three tiers of the e2e suite, and its quarantine (ROADMAP.md, "A suite that can be trusted"). Pure, and tested in
// tests/tiers.test.ts.
//   guard: what a release waits on (the maintainer's decision, 2026-10-12): the tests that keep a writer's work safe.
//          Text typed reaches the note once and whole, undo and redo, outside edits kept, the files Binders writes,
//          renames, moves, merges and splits that keep every word and the order, snapshots, import, replace.
//   core:  each feature's main path, menus, the keyboard, what a view shows. Every test is core unless it says
//          otherwise. A failure is listed first in the verdict, as something to fix, and does not hold a release.
//   look:  how it looks and how fast it feels: pixel sizes, what is in sight, where a menu opens, colours, the exact rows
//          of a list, frame times. A failure is reported apart.
// A test says its tier with `tier: 'guard'` or `tier: 'look'` beside its name and fn, or its whole file does with
// `export const tier`. The tests written before the tiers were sorted once, by reading each (2026-10-12): they are
// listed by name in tests/e2e/tiers.json, `{ guard: { file: [names] }, look: { file: [names] } }`. A name there that no
// test has any more is said (`unlisted`): a renamed test falls back to core, so a guard test renamed without its
// entry stops holding a release, and the run says so.
// Which themes a test runs in: a core test in the light one only (what it checks is the same in both, and a second run
// is only a second chance to flake); a look test in both. A test or a file that is about a theme says so with
// `themes: [...]` (`export const themes` for a file): specs-qa11-paragraphs-dark.mjs runs in the dark one only.
// The quarantine (tests/e2e/quarantine.json) is for a test that fails for a reason of the machine (a font, a slow
// runner), not of Binders: listed with an owner and a date, it is reported and does not block until that date. After
// it, it counts again as it would. A bug of Binders is not quarantined: it goes in open-findings.json.

export const TIERS = ['guard', 'core', 'look'];

/** A spec's tier: its own, else tiers.json's (`listed`: the tier it is listed under, or true for look as the first
    list had it), else its file's, else core. Anything that isn't a tier is refused, so a typo can't hide a test from
    the gate. */
export function tierOf(spec, fileTier, listed = false) {
	const t = spec?.tier ?? (listed === true ? 'look' : listed || null) ?? fileTier ?? 'core';
	if (!TIERS.includes(t)) throw new Error(`"${spec?.name}": the tier "${t}" is not one of ${TIERS.join(', ')}`);
	return t;
}

export const THEMES = ['light', 'dark'];

/** The themes a spec runs in: its own `themes`, else its file's, else both for look and light for core. Anything else
    is refused. */
export function themesOf(spec, tier, fileThemes) {
	const t = spec?.themes ?? fileThemes ?? (tier === 'look' ? THEMES : ['light']);  // (guard and core: light)
	if (!Array.isArray(t) || !t.length || t.some((x) => !THEMES.includes(x))) throw new Error(`"${spec?.name}": themes ${JSON.stringify(t)} are not some of ${THEMES.join(', ')}`);
	return t;
}

/** tiers.json's lists, as `{ tier: { file: [names] } }`; the first list (`{ file: [names] }`, all look) is read too. */
export function lists(map) {
	const m = map ?? {};
	if (Object.keys(m).some((k) => /\.mjs$/.test(k))) return { look: m };
	return Object.fromEntries(Object.entries(m).filter(([k]) => TIERS.includes(k)));
}

/** The tier each name of one file is listed under: `{ name: tier }`. */
export function listedFor(map, file) {
	const out = {};
	for (const [tier, files] of Object.entries(lists(map))) for (const name of files[file] ?? []) out[name] = tier;
	return out;
}

/** Each spec with its tier and its themes written on it (`{ ...spec, tier, themes }`), from one spec file's module;
    `listed`, what listedFor gives for that file (or, as before, an array of look names). */
export function tiered(mod, listed = {}) {
	const by = Array.isArray(listed) ? Object.fromEntries(listed.map((n) => [n, 'look'])) : listed ?? {};
	return (mod.specs ?? []).map((s) => { const tier = tierOf(s, mod.tier, by[s.name] ?? false); return { ...s, tier, themes: themesOf(s, tier, mod.themes) }; });
}

/** The names tiers.json lists that no test of their file has (`names`: `{ file: [names] }` of the files that were
    loaded; a file not loaded is not looked at): `[{ file, name, tier }]`. */
export function unlisted(map, names) {
	const out = [];
	for (const [tier, files] of Object.entries(lists(map))) {
		for (const [file, list] of Object.entries(files)) {
			if (!names[file]) continue;
			const have = new Set(names[file]);
			for (const name of list) if (!have.has(name)) out.push({ file, name, tier });
		}
	}
	return out;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The quarantine list read against `today` ("YYYY-MM-DD"): `active`, the names it still holds; `ended`, the entries
    whose date has passed (they hold nothing); `bad`, a sentence for each entry that can't be held: no name, file, owner,
    reason, or a date that isn't one. */
export function quarantine(list, today) {
	const active = new Set(), ended = [], bad = [];
	for (const [i, q] of (Array.isArray(list) ? list : []).entries()) {
		const missing = ['name', 'file', 'owner', 'until', 'why'].filter((k) => typeof q?.[k] !== 'string' || !q[k].trim());
		if (missing.length) { bad.push(`Quarantine entry ${i + 1}${q?.name ? ` ("${q.name}")` : ''} has no ${missing.join(', ')}.`); continue; }
		if (!DAY.test(q.until) || Number.isNaN(Date.parse(q.until))) { bad.push(`Quarantine entry "${q.name}": "${q.until}" is not a date (YYYY-MM-DD).`); continue; }
		if (q.until < today) ended.push(q); else active.add(q.name);
	}
	if (!Array.isArray(list)) bad.push('The quarantine is not a list.');
	return { active, ended, bad };
}

/** Today as the quarantine reads it, in UTC (the runners' clock). */
export const today = (now = new Date()) => now.toISOString().slice(0, 10);
