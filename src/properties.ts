import { parseYaml, stringifyYaml, type App, type TFile } from 'obsidian';
import { blockIsText, parts } from './scene-text';

/* Writing properties to a note: the one road for it. Obsidian's own `processFrontMatter` is taken for every note but
   two kinds, which it gets wrong (measured; the tests are in tests/e2e/specs-scenes.mjs):
     - a note that opens with a block that isn't properties: a rule, a paragraph, and another rule; a list between
       two rules; YAML that can't be read. `processFrontMatter` takes any such block for properties (it cuts with
       `getFrontMatterInfo`, which only looks for the two rules) and then writes the new properties over the paragraph,
       or writes nothing and says nothing, or throws. To Binders that block is the writer's text (scene-text.ts,
       `parts`), so the properties are written as a block of their own above it;
     - a note that starts with a byte-order mark: `processFrontMatter` finds no properties after the mark, and writes a
       second block above it, so the properties the note had turn into text.
   For those two the block is written here, in one `vault.process`, and not a byte of the note's text is dropped. */

const MARK = String.fromCharCode(0xFEFF);
const ownRoad = (text: string): boolean => text.startsWith(MARK) || blockIsText(text);

/** Changes a note's properties: `edit` is handed them as they are and changes them in place, as with
    `processFrontMatter`. It may throw to refuse, and then nothing is written. */
export async function editProperties(app: App, file: TFile, edit: (fm: Record<string, unknown>) => void): Promise<void> {
	// (from the disk as it is: `vault.read` drops the mark)
	if (ownRoad(await app.vault.adapter.read(file.path))) {
		let done = false, failed: unknown = null;
		await app.vault.process(file, (cur) => {
			// asked again of what the note says now: if it's an ordinary note after all, it's Obsidian's to write
			if (!ownRoad(cur)) return cur;
			done = true;
			try {
				// (`parts` has the mark in `front`, and no block where the block is text: then the properties start empty)
				const p = parts(cur), was: unknown = p.yaml.trim() ? parseYaml(p.yaml) : null;
				const fm: Record<string, unknown> = was && typeof was === 'object' && !Array.isArray(was) ? was as Record<string, unknown> : {};
				edit(fm);
				if (!Object.keys(fm).length && !p.yaml) return cur; // a property taken away from a note that has none
				// in the note's own line breaks; the mark stays first
				const br = cur.includes('\r\n') ? '\r\n' : '\n', mark = cur.startsWith(MARK) ? MARK : '';
				const block = Object.keys(fm).length ? `---${br}${stringifyYaml(fm).replace(/\r?\n/g, br)}---${br}` : '';
				return mark + block + p.body;
			} catch (e) { failed = e; return cur; }
		});
		if (failed) throw failed;
		if (done) return;
	}
	await app.fileManager.processFrontMatter(file, edit);
}

/** A note's properties as the disk has them now, not as Obsidian's cache last read them (the cache is a moment behind a
    write, and a check that a value is what it was left must not be fooled by that). Empty if there are none, or they can't be read. */
export async function readProperties(app: App, file: TFile): Promise<Record<string, unknown>> {
	try {
		const yaml = parts(await app.vault.adapter.read(file.path)).yaml;
		const v: unknown = yaml.trim() ? parseYaml(yaml) : null;
		return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
	} catch { return {}; }
}
