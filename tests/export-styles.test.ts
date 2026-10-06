import { MANUSCRIPT_STYLES } from '../src/export/docx-parts';
import { ebookCss } from '../src/export/epub-css';
import { STYLE_VERSION, freeName, listStyles, readStyleFile, resolveStyle, saysNothing, standalone, styleNameProblem, writeStyleFile, type StyleFile } from '../src/export/style-file';
import { BUILT_IN, GROUPS, readValue, rowsOf, toBookStyle, toManuscriptStyle } from '../src/export/style-rows';
import { CLASSIC, MODERN } from '../src/export/style';
import { done, eq, ok } from './harness';

const shelf = (files: Record<string, string>): Map<string, StyleFile> => new Map(Object.entries(files).map(([n, t]) => [n, readStyleFile(t)]));
const row = (family: 'book' | 'manuscript', key: string) => rowsOf(family).find((r) => r.key === key)!;

// ---- the rows: what the editor offers is what a file has ----
{
	eq(rowsOf('book').map((r) => r.key).join(), 'typeface,type-size,line-spacing,paragraphs,alignment,quotes,chapter-heading,heading-lettering,heading-size,heading-alignment,space-above,chapter-opens,first-words,scene-break,running-heads,page-numbers,margins', 'a book style’s rows, by the file’s names');
	eq(rowsOf('manuscript').map((r) => r.key).join(), 'typeface,line-spacing,italics,chapter-starts,scene-break,header,title-page', 'a manuscript style’s seven');
	eq(GROUPS.book.map((g) => `${g.name} ${g.rows.length}`).join(), 'Text 6,Chapters 7,Scene breaks 1,Pages 3', 'in the design’s groups');
	eq(rowsOf('book').filter((r) => !r.pages).map((r) => r.key).join(), 'paragraphs,quotes,chapter-heading,heading-lettering,heading-size,heading-alignment,first-words,scene-break', 'the rows an ebook decides');
	for (const [name, b] of BUILT_IN) for (const r of rowsOf(b.family)) ok(readValue(r, b.values[r.key]) === b.values[r.key], `${name}: its own ${r.key} is a value the row takes`);
	eq(JSON.stringify(toBookStyle('Classic', BUILT_IN.get('Classic')!.values)), JSON.stringify(CLASSIC), 'Classic through its values is Classic');
	eq(JSON.stringify(toManuscriptStyle(MANUSCRIPT_STYLES[1].name, BUILT_IN.get(MANUSCRIPT_STYLES[1].name)!.values)), JSON.stringify(MANUSCRIPT_STYLES[1]), 'and a manuscript style likewise');
	const read = [readValue(row('book', 'type-size'), '12'), readValue(row('book', 'type-size'), 30), readValue(row('book', 'margins'), 'Wide'), readValue(row('book', 'margins'), 'huge'), readValue(row('book', 'scene-break'), ''), readValue(row('book', 'scene-break'), 'a mark far too long to be one'), readValue(row('manuscript', 'title-page'), false), readValue(row('manuscript', 'title-page'), 'no'), readValue(row('book', 'chapter-heading'), ' ')];
	eq(read.map(String).join('|'), '12|undefined|wide|undefined||undefined|false|undefined|undefined', 'a value is checked against its row');
}

// ---- the file: read, and changed a line at a time ----
{
	const text = '---\nexport-style: 1              # format version\nbased-on: Classic\nmargins: wide\nscene-break: "⁂"\nmine: [1, 2]\nnested:\n  a: 1\n---\n/* mine */\np.break { color: red; }\n';
	const f = readStyleFile(text);
	eq([f.version, String(f.broken), f.basedOn, f.props.get('margins'), f.props.get('scene-break'), String(f.props.get('mine')), f.props.has('nested'), f.css].join('|'), '1|null|Classic|wide|⁂|undefined|true|/* mine */\np.break { color: red; }', 'properties, then CSS');
	const changed = writeStyleFile(text, 'Classic', { margins: undefined, 'type-size': 12, 'chapter-heading': '{number:roman}. {title}', 'scene-break': '' });
	eq(changed, '---\nexport-style: 1              # format version\nbased-on: Classic\nscene-break: ""\nmine: [1, 2]\nnested:\n  a: 1\ntype-size: 12\nchapter-heading: "{number:roman}. {title}"\n---\n/* mine */\np.break { color: red; }\n', 'only the lines that change do: a comment, a property of the writer’s own and the CSS stay');
	eq(writeStyleFile(null, 'Modern', { paragraphs: 'spaced', 'title-page': false }), '---\nexport-style: 1\nbased-on: Modern\nparagraphs: spaced\ntitle-page: false\n---\n', 'a new file');
	eq(writeStyleFile('---\r\nbased-on: Classic\r\n---\r\n', 'Classic', { margins: 'wide' }), '---\r\nexport-style: 1\r\nbased-on: Classic\r\nmargins: wide\r\n---\r\n', 'a file’s line endings are kept, and its version is said');
	const back = readStyleFile(writeStyleFile(null, 'Classic', { 'scene-break': '# "x" \\', 'chapter-heading': 'true' }));
	eq([back.props.get('scene-break'), back.props.get('chapter-heading')].join('|'), '# "x" \\|true', 'what is written reads back as it was');
	ok(saysNothing('---\nexport-style: 1\nbased-on: Classic\n---\n') && !saysNothing(text) && !saysNothing('---\nbased-on: Classic\n---\np { }') && !saysNothing('---\nmine: 1\n---\n'), 'a file that says nothing, and ones that say something');
	eq([readStyleFile('margins: wide').broken !== null, readStyleFile('---\nexport-style: soon\n---').broken !== null, readStyleFile('---\nmargins: wide\n---').version, readStyleFile('---\nexport-style: 7\n---').version].join(), 'true,true,1,7', 'a file without properties, or with no version number, is broken; one that doesn’t say is version 1');
	eq([styleNameProblem('Mine') === null, styleNameProblem(' ') === null, styleNameProblem('a/b') === null, styleNameProblem('.x') === null].join(), 'true,false,false,false', 'a style’s name is a file’s name');
	eq(freeName('Classic', (n) => n === 'Classic 2'), 'Classic 3', 'the first free name');
}

// ---- resolving: the differences over what it is based on ----
{
	const none = resolveStyle('Classic', new Map())!;
	ok(none.builtIn && none.changes === 0 && !none.hasFile && none.values.typeface === 'EB Garamond' && none.family === 'book', 'a built-in style as it comes');
	eq(String(resolveStyle('Nothing', new Map())), 'null', 'a style that isn’t there');
	const files = shelf({
		Classic: '---\nexport-style: 1\nbased-on: Classic\ntype-size: 12\nheading-lettering: italic\nmargins: normal\n---\np { color: red; }',
		Wide: '---\nexport-style: 1\nbased-on: Classic\nmargins: wide\nbogus: 3\nparagraphs: sideways\n---\nh1 { color: blue; }',
		Wider: '---\nbased-on: Wide\nscene-break: "~"\n---\n',
		Loop: '---\nbased-on: Pool\n---\n', Pool: '---\nbased-on: Loop\n---\n',
		Lost: '---\nbased-on: Gone\nmargins: narrow\n---\n',
		Agent: `---\nbased-on: ${MANUSCRIPT_STYLES[0].name}\nline-spacing: single\ntitle-page: false\n---\n`,
		Later: `---\nexport-style: ${STYLE_VERSION + 1}\nbased-on: Modern\nmargins: wide\n---\n`,
		Torn: 'margins: wide',
	});
	const c = resolveStyle('Classic', files)!;
	eq([c.changes, c.values['type-size'], c.original['type-size'], c.values['heading-lettering'], c.basedOn, c.css].join('|'), '2|12|11|italic|Classic|p { color: red; }', 'a built-in style changed in place: its file over itself as it comes (a value that is the same is no change)');
	const w = resolveStyle('Wide', files)!;
	eq([w.builtIn, w.basedOn, w.root, w.changes, w.values.margins, w.values['type-size'], w.values.paragraphs, w.css, w.warnings.length].join('|'), 'false|Classic|Classic|1|wide|12|indented|p { color: red; }\nh1 { color: blue; }|1', 'a style of one’s own: over the built-in as it is changed here; a value that can’t be read is its base’s, and is said');
	ok(/paragraphs.*can’t be read \(sideways\)/.test(w.warnings[0]), 'the warning names the property');
	const ww = resolveStyle('Wider', files)!;
	eq([ww.basedOn, ww.root, ww.values.margins, ww.values['scene-break'], ww.changes, ww.original.margins].join('|'), 'Wide|Classic|wide|~|1|wide', 'based on another of one’s own');
	const loop = resolveStyle('Loop', files)!;
	ok(loop.values.typeface === 'EB Garamond' && loop.warnings.some((x) => x.includes('in turn')), 'two based on each other fall back to Classic');
	const lost = resolveStyle('Lost', files)!;
	ok(lost.basedOn === 'Classic' && lost.values.margins === 'narrow' && lost.values['type-size'] === 12 && /isn’t among the styles/.test(lost.warnings[0]), 'a missing base falls back to Classic, with its own changes kept');
	const a = resolveStyle('Agent', files)!;
	eq([a.family, a.changes, toManuscriptStyle('Agent', a.values).lineSpacing, toManuscriptStyle('Agent', a.values).titlePage].join('|'), 'manuscript|2|single|false', 'a manuscript style of one’s own');
	const later = resolveStyle('Later', files)!;
	eq([later.state, later.values.margins, later.values.typeface, later.warnings.length].join('|'), 'newer|normal|EB Garamond|1', 'a newer file is listed and not used');
	const torn = resolveStyle('Torn', files)!;
	eq([torn.state, torn.values.margins, torn.warnings.length].join('|'), 'broken|normal|1', 'a broken file says so and falls back');
	eq(listStyles(files).map((s) => s.name).join(), `Classic,Modern,${MANUSCRIPT_STYLES.map((s) => s.name).join()},Agent,Later,Loop,Lost,Pool,Torn,Wide,Wider`, 'every style: built in first, then one’s own by name');
	const alone = standalone(ww, '---\nbased-on: Wide\nscene-break: "~"\nmine: 1\n---\n');
	eq(alone, '---\nexport-style: 1\nbased-on: Classic\nscene-break: "~"\nmine: 1\ntype-size: 12\nheading-lettering: italic\nmargins: wide\n---\np { color: red; }\nh1 { color: blue; }\n', 'a style made to stand by itself carries every difference from the built-in one, and the CSS it had from its base');
	const again = resolveStyle('Wider', shelf({ Wider: alone }))!;
	eq(JSON.stringify(again.values), JSON.stringify(ww.values), 'and reads as the same style without the files it stood on');
	ok(ebookCss(toBookStyle('Wide', w.values, w.css)).trim().endsWith('h1 { color: blue; }'), 'the CSS reaches the ebook, after Binders’ own rules');
	ok(ebookCss(MODERN).includes('text-align: start') && !ebookCss(MODERN).includes('.lead {'), 'Modern as an ebook: at the left, the first words as the rest');
}

done('export-styles');
