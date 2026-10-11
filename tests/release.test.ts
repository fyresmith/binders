// The release system's pure parts (scripts/changelog-lib.mjs, scripts/suite-lib.mjs): the version worked out from
// Unreleased, adding to it, turning it into a release, finding a version's notes, the one-time migration, and what the
// runs of the e2e workflow add up to.
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
// @ts-expect-error a plain script, with no types
import { addUnreleased, applyRelease, bump, compareVersions, foldReleased, hasEntries, internalWhy, migrate, nextVersion, notesOf, parseChangelog, parseEntries, unreleasedOf } from '../scripts/changelog-lib.mjs';
// @ts-expect-error a plain script, with no types
import { suiteState } from '../scripts/suite-lib.mjs';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const throws = (f: () => unknown) => { try { f(); return ''; } catch (e) { return (e as Error).message; } };
const v = (last: string, entries: Record<string, string[]>, opts = {}) => nextVersion(last, entries, opts).version;

// the version, by semantic versioning
{
	eq(v('0.51.1', { Fixed: ['a'] }), '0.51.2', 'before 1.0: only Fixed is a patch');
	eq(v('0.51.1', { Added: ['a'] }), '0.52.0', 'before 1.0: Added is minor');
	eq(v('0.51.1', { Changed: ['a'] }), '0.52.0', 'before 1.0: Changed is minor');
	eq(v('0.51.1', { Removed: ['a'] }), '0.52.0', 'before 1.0: Removed is minor');
	eq(v('0.51.1', { Fixed: ['a'], Added: ['b'] }), '0.52.0', 'before 1.0: Fixed with Added is minor');
	eq(v('0.51.1', { Fixed: ['a'], Removed: ['b'] }), '0.52.0', 'before 1.0: Fixed with Removed is minor');
	eq(v('0.51.1', { Added: ['a'] }, { breaking: true }), '0.52.0', 'before 1.0: --breaking changes nothing');
	eq(v('1.0.0', { Fixed: ['a'] }), '1.0.1', 'from 1.0: Fixed is a patch');
	eq(v('1.2.3', { Added: ['a'] }), '1.3.0', 'from 1.0: Added is minor');
	eq(v('1.2.3', { Changed: ['a'], Fixed: ['b'] }), '1.3.0', 'from 1.0: Changed is minor');
	eq(v('1.2.3', { Removed: ['a'] }), '1.3.0', 'from 1.0: Removed is minor unless said to be breaking');
	eq(v('1.2.3', { Removed: ['a'] }, { breaking: true }), '2.0.0', 'from 1.0: --breaking is major');
	eq(v('1.2.3', { Fixed: ['a'] }, { breaking: true }), '2.0.0', 'from 1.0: --breaking is major even with only fixes');
	eq(v('0.59.4', { Added: ['a'] }, { as: '1.0.0' }), '1.0.0', '--as sets the version');
	eq(nextVersion('0.59.4', { Added: ['a'] }, { as: '1.0.0' }).kind, 'set', 'and says so');
	ok(/not above the last release/.test(throws(() => v('0.59.4', { Added: ['a'] }, { as: '0.59.4' }))), '--as must be above the last release');
	ok(/not above/.test(throws(() => v('0.59.4', { Added: ['a'] }, { as: '0.1.0' }))), 'and not below it');
	ok(/not a version/.test(throws(() => v('0.59.4', { Added: ['a'] }, { as: '1.0' }))), 'and a version');
	ok(/nothing under Unreleased/.test(throws(() => v('0.1.0', {}))), 'no entries, no release');
	ok(/nothing under Unreleased/.test(throws(() => v('0.1.0', { Added: [] }))), 'and an empty list is none');
	eq(bump('0.9.9', 'minor'), '0.10.0', 'minor sets the patch to zero');
	ok(compareVersions('0.10.0', '0.9.9') > 0 && compareVersions('1.0.0', '0.99.99') > 0, 'versions compare as numbers');
}

// adding to Unreleased, and releasing it
{
	const log = '# Changelog\n\nIntro.\n\n## 0.1.0 (2026-01-01)\n\n### Added\n\n- The first.\n';
	let t = addUnreleased(log, { fixed: ['f1'] });
	ok(/\n## Unreleased\n\n### Fixed\n\n- f1\n\n## 0.1.0/.test(t), 'Unreleased is made at the top');
	t = addUnreleased(t, { added: ['a1'], fixed: ['f2'] });
	t = addUnreleased(t, { changed: ['c1'], added: ['a2'], removed: ['r1'] });
	eq(j(unreleasedOf(t)), j({ Added: ['a1', 'a2'], Changed: ['c1'], Fixed: ['f1', 'f2'], Removed: ['r1'] }), 'entries go on the end of their list, in the order made, and are grouped');
	ok(t.indexOf('### Added') < t.indexOf('### Changed') && t.indexOf('### Changed') < t.indexOf('### Fixed') && t.indexOf('### Fixed') < t.indexOf('### Removed'), 'in the order Added, Changed, Fixed, Removed');
	ok(t.endsWith('- The first.\n') && t.includes('## 0.1.0 (2026-01-01)\n\n### Added\n\n- The first.\n'), 'a released section is left as it was');
	eq(unreleasedOf(log), null, 'no Unreleased');
	ok(hasEntries(unreleasedOf(t)) && !hasEntries(null) && !hasEntries({ Added: [] }), 'hasEntries');

	const rel = applyRelease(t, '0.2.0', '2026-10-11');
	ok(!/Unreleased/.test(rel), 'the release has no Unreleased any more');
	ok(/^## 0\.2\.0 \(2026-10-11\)\n\n### Added\n\n- a1\n- a2\n\n### Changed\n\n- c1\n\n### Fixed\n\n- f1\n- f2\n\n### Removed\n\n- r1\n\n## 0\.1\.0/m.test(rel), 'Unreleased becomes the version, grouped, in order');
	ok(rel.indexOf('# Changelog\n\nIntro.') === 0 && rel.endsWith('\n') && !rel.endsWith('\n\n'), 'the rest and the ending are kept');
	ok(/nothing under Unreleased/.test(throws(() => applyRelease(log, '0.2.0', '2026-10-11'))), 'a release with no Unreleased is refused');
	ok(/already has a section/.test(throws(() => applyRelease(t, '0.1.0', '2026-10-11'))), 'and one for a version that is there');
	eq(notesOf(rel, '0.2.0'), '## 0.2.0 (2026-10-11)\n\n### Added\n\n- a1\n- a2\n\n### Changed\n\n- c1\n\n### Fixed\n\n- f1\n- f2\n\n### Removed\n\n- r1\n', 'the notes of a version');
	eq(notesOf(rel, '0.20.0'), '', 'a version that is not there has none (0.2.0 is not 0.20.0)');
	// multi-line entries survive a round trip
	const multi = addUnreleased('# C\n\n## 0.1.0 (x)\n\n- y\n', { added: ['one'] }).replace('- one', '- one\n  more of it');
	eq(j(parseEntries(parseChangelog(multi).sections[0].raw)), j({ Added: ['one\n  more of it'] }), 'a bullet of two lines');
}

// the notes: the awk in release.yml, on the real changelog, as migrated
{
	const yml = readFileSync('.github/workflows/release.yml', 'utf8');
	const prog = /awk -v v="## \$\{GITHUB_REF_NAME\}" '([^']+)' CHANGELOG\.md/.exec(yml)?.[1] ?? '';
	ok(prog.length > 10, 'the awk is in release.yml');
	const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')).version;
	const real = readFileSync('CHANGELOG.md', 'utf8');
	const { text } = migrate(real, { last: manifest });
	// an Unreleased with a made-up release, so there is a new-shaped section to find as well as the old ones
	const sample = unreleasedOf(text) ? applyRelease(text, '99.0.0', '2099-01-01') : text;
	const heads = parseChangelog(sample).sections.map((s: { title: string }) => s.title.split(' ')[0]).filter((x: string) => /^\d+\.\d+\.\d+$/.test(x));
	ok(heads.length > 20, `the changelog has ${heads.length} versions to find`);
	let same = 0;
	for (const ver of heads) {
		const viaAwk = execFileSync('awk', ['-v', `v=## ${ver}`, prog], { input: sample, encoding: 'utf8' });
		// (the same, but for the blank line after a section, which a file keeps and the release notes do not need)
		if (viaAwk.replace(/\s+$/, '') === notesOf(sample, ver).replace(/\s+$/, '')) same++;
		else console.log(`the awk and notesOf differ for ${ver}`);
	}
	eq(same, heads.length, 'the awk finds what notesOf finds, for every version');
	ok(notesOf(sample, heads[0]).startsWith(`## ${heads[0]}`), 'and starts with its heading');
	eq(execFileSync('awk', ['-v', 'v=## 0.0.0', prog], { input: sample, encoding: 'utf8' }), '', 'a version that is not there has no notes');
}

// the migration
{
	const real = readFileSync('CHANGELOG.md', 'utf8'), last = JSON.parse(readFileSync('manifest.json', 'utf8')).version;
	const first = migrate(real, { last });
	const again = migrate(first.text, { last });
	eq(again.text, first.text, 'migrating twice is the same as once');
	eq(again.folded.length, 0, 'and the second folds nothing');
	const log = parseChangelog(first.text), at = log.sections.findIndex((s: { title: string }) => s.title.startsWith(last + ' '));
	ok(at >= 0 && at <= 1, 'the last release is the first section, or just under Unreleased');
	const oldAt = parseChangelog(real).sections.findIndex((s: { title: string }) => s.title.startsWith(last + ' '));
	eq(j(log.sections.slice(at).map((s: { raw: string }) => s.raw)), j(parseChangelog(real).sections.slice(oldAt).map((s: { raw: string }) => s.raw)), 'released sections are untouched');
	ok(first.text.includes('semantic versioning') && first.text.includes('npm run release'), 'the intro says how it works now');

	const small = [
		'# Changelog', '', 'All notable changes to Binders. Old intro.', '',
		'## 0.3.1 (2026-01-04)', '', '### Changed', '', '- Nothing you will notice: tidy.', '',
		'## 0.3.0 (2026-01-03)', '', '### Added', '', '- A new thing.', '', '### Fixed', '', '- A bug.', '',
		'## 0.2.1 (2026-01-02)', '', '### Fixed', '', '- Docs wording.', '- Old bug.', '',
		'## 0.2.0 (2026-01-01)', '', '### Added', '', '- Released.', '',
	].join('\n');
	const m = migrate(small, { last: '0.2.0', titles: { '0.2.1': 'Docs: wording' } });
	eq(j(unreleasedOf(m.text)), j({ Added: ['A new thing.'], Fixed: ['A bug.'] }), 'folded, grouped, internal ones left out');
	eq(j(m.dropped.map((d: { text: string }) => d.text)), j(['Docs wording.', 'Old bug.', 'Nothing you will notice: tidy.']), 'and listed (a docs commit drops all its entries)');
	eq(j(m.folded), j(['0.2.1', '0.3.0', '0.3.1']), 'oldest first');
	ok(!/0\.3\.1|0\.2\.1/.test(m.text), 'no folded section is left');
	eq(migrate('# C\n\n## 0.2.0 (x)\n\n- y\n', { last: '0.2.0' }).folded.length, 0, 'nothing above the last release: nothing to do');
	ok(/no section for the last release/.test(throws(() => migrate(small, { last: '9.9.9' }))), 'the last release has to be there');
	eq(j(unreleasedOf(migrate('# C\n\n## Unreleased\n\n### Added\n\n- hand written\n\n## 0.2.0 (x)\n\n- y\n', { last: '0.2.0' }).text)), j({ Added: ['hand written'] }), 'a lone Unreleased is left as it is');
	ok(internalWhy('Nothing you will notice: x') && internalWhy('The roadmap says y') && internalWhy('', 'Tests: z') && !internalWhy('Find leaves links alone.', 'Find: links'), 'what counts as internal');

	// folding the per-commit sections under each release
	const folded = foldReleased(small, ['0.2.0', '0.3.0']);
	eq(j(parseChangelog(folded).sections.map((s: { title: string }) => s.title)), j(['0.3.1 (2026-01-04)', '0.3.0 (2026-01-03)', '0.2.0 (2026-01-01)']), 'a section between releases goes under the release above it');
	eq(j(parseEntries(parseChangelog(folded).sections[1].raw)), j({ Added: ['A new thing.'], Fixed: ['Docs wording.', 'Old bug.', 'A bug.'] }), 'with the release’s own entries last');
}

// what the runs of the workflow add up to
{
	const run = (id: number, status: string, conclusion: string | null, createdAt: string, displayTitle = 'E2E suite') => ({ databaseId: id, status, conclusion, createdAt, displayTitle, url: `u${id}` });
	eq(suiteState([]).state, 'none', 'no runs');
	eq(suiteState([run(1, 'completed', 'success', '2026-01-01')]).state, 'passed', 'a successful run');
	eq(suiteState([run(1, 'completed', 'failure', '2026-01-01')]).state, 'failed', 'a failed one');
	eq(suiteState([run(1, 'in_progress', null, '2026-01-01')]).state, 'running', 'one going');
	eq(suiteState([run(1, 'completed', 'cancelled', '2026-01-01')]).state, 'cancelled', 'one cancelled');
	eq(suiteState([run(1, 'completed', 'failure', '2026-01-01'), run(2, 'completed', 'success', '2026-01-02')]).state, 'passed', 'a later success after a failure (a re-run)');
	eq(suiteState([run(1, 'completed', 'failure', '2026-01-01'), run(2, 'queued', null, '2026-01-02')]).state, 'running', 'a failure and a new run going');
	eq(suiteState([run(1, 'completed', 'success', '2026-01-01', 'E2E narrowed corkboard  both')]).state, 'none', 'a narrowed run is no run of the suite');
	eq(suiteState([run(1, 'completed', 'success', '2026-01-01', 'CI')]).state, 'none', 'nor is another workflow’s');
}

done('release');
