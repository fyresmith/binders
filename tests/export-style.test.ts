import { DETAIL_PROPS, applyDetails, languageName, languageTag, linked, readDetails } from '../src/export/details';
import { BOOK_STYLES, CLASSIC, MODERN, TYPEFACES, bookHeading, bookStyle, bookWord, isRtl, roman } from '../src/export/style';
import { done, eq, ok } from './harness';

// ---- a book style is data, under the names its file has; headings from its pattern ----
{
	eq(BOOK_STYLES.map((s) => s.name).join(), 'Classic,Modern', 'the book styles built in');
	eq(bookStyle('Modern').typeface, 'Source Serif 4', 'Modern is set in Source Serif');
	eq(Object.keys(MODERN).sort().join(), Object.keys(CLASSIC).sort().join(), 'the two built in have the same properties');
	ok(BOOK_STYLES.every((s) => TYPEFACES.includes(s.typeface)), 'and a typeface that travels in the plugin');
	eq([MODERN['scene-break'], MODERN['heading-alignment'], MODERN['heading-size'], MODERN['heading-lettering'], MODERN['first-words'], MODERN['running-heads'], MODERN['page-numbers']].join('|'), '|left|large|as typed|as the rest|title|top outside', 'Modern: a large plain numeral at the left, breaks as space, the title and the number at the top outside');
	eq([bookHeading(MODERN, { role: 'chapter', number: 3, title: '' }).join(' / '), bookHeading(MODERN, { role: 'chapter', number: 3, title: 'Storm' }).join(' / ')].join('|'), '3|3 / Storm', 'Modern: the numeral alone, and a chapter’s title under it when it has one');
	eq(bookStyle('Nothing').name, 'Classic', 'a style that isn’t there is Classic');
	const keys = ['typeface', 'type-size', 'line-spacing', 'paragraphs', 'alignment', 'quotes', 'chapter-heading', 'heading-lettering', 'heading-size', 'heading-alignment', 'space-above', 'chapter-opens', 'first-words', 'scene-break', 'running-heads', 'page-numbers', 'margins'];
	eq(Object.keys(CLASSIC).filter((k) => k !== 'name').sort().join(), keys.sort().join(), 'a style has the properties a .bookstyle file has, by those names');
	const h = (number: number | null, title: string, role: 'chapter' | 'part' | 'front' = 'chapter', language = 'en', pattern?: string) => bookHeading(pattern ? { ...CLASSIC, 'chapter-heading': pattern } : CLASSIC, { role, number, title }, language).join(' / ');
	eq(h(21, 'Storm warning'), 'Chapter Twenty-One / Storm warning', 'Classic: the number in words, the title under it');
	eq(h(3, ''), 'Chapter Three', 'a line whose title is empty is dropped');
	eq(h(null, 'Prologue'), 'Prologue', 'a chapter without a number is its name');
	eq(h(null, ''), '', 'and nothing when it has neither');
	eq(h(2, 'The island', 'part'), 'Part Two / The island', 'a part: numbered as the chapters are');
	eq(h(null, 'Dedication', 'front'), 'Dedication', 'front matter is its title');
	eq([h(4, 'T', 'chapter', 'en', '{number:roman}. {title}'), h(4, '', 'chapter', 'en', '{number:roman}. {title}'), h(4, 'T', 'chapter', 'en', '{number}'), h(14, 'T', 'part', 'en', '{number:roman}')].join('|'), 'IV. T||4|Part XIV / T', 'a pattern of the writer’s own: figures, Roman numerals, the title');
	eq([h(3, 'Le passeur', 'chapter', 'fr'), h(3, '', 'chapter', 'de-AT'), h(2, '', 'part', 'fr'), h(3, '', 'chapter', 'ja'), h(3, 'T', 'chapter', 'sw')].join('|'), 'Chapitre 3 / Le passeur|Kapitel 3|Partie 2|第3章|3 / T', 'in another language: its own word and figures; a number alone where Binders has no word');
	eq([roman(1994), roman(4), roman(0)].join(), 'MCMXCIV,IV,0', 'Roman numerals');
	eq([bookWord('contents', 'fr-CA'), bookWord('notes', 'de'), bookWord('contents', 'sw')].join('|'), 'Table des matières|Anmerkungen|', 'the words export writes, in the book’s language, or none');
	ok(isRtl('ar') && isRtl('he-IL') && !isRtl('en') && !isRtl('hr'), 'which languages run right to left');
}

// ---- Book details: read from the binder note's properties, checked, and put back ----
{
	eq(['en', 'EN-gb', 'zh-hant', 'pt_BR', 'es-419', 'sr-Latn-RS'].map((t) => languageTag(t)).join(), 'en,en-GB,zh-Hant,pt-BR,es-419,sr-Latn-RS', 'a language tag is written as the standard has it');
	eq(['English', 'e', 'en-', 'en-GB-oed-x', '12', '', null, 7].map((t) => String(languageTag(t))).join(), 'null,null,null,null,null,null,null,null', 'anything else is no language');
	eq(languageName('en-GB'), 'British English', 'a language has a name');
	eq([linked('[[cover.png]]'), linked('[[Art/cover.png|the cover]]'), linked('Art/cover.png'), linked(undefined)].join('|'), 'cover.png|Art/cover.png|Art/cover.png|', 'a cover is named as a link or a path');
	const d = readDetails({ binder: 1, title: ' The Lighthouse ', author: 'Mara', structure: 'parts and chapters', cover: '[[cover.png]]', language: 'EN-gb', 'title-page': false, 'contents-page': 'Always', copyright: '© Mara', 'book-style': 'Classic' });
	eq(JSON.stringify(d), JSON.stringify({ title: 'The Lighthouse', subtitle: '', author: 'Mara', structure: 'parts', cover: 'cover.png', copyright: '© Mara', language: 'en-GB', titlePage: false, contents: 'always', bookStyle: 'Classic', manuscriptStyle: '' }), 'details as the note says them');
	const none = readDetails({ language: 'Klingon!', structure: 3 });
	ok(none.language === '' && none.structure === null && none.titlePage && none.contents === 'titled' && none.title === '', 'what isn’t said, or can’t be read, is not said');

	const fm: Record<string, unknown> = { binder: 1, contents: ['a', 'b'], synopsis: 'Mine', title: 'Old', subtitle: 'Gone', custom: [1, 2] };
	applyDetails(fm, { title: ' New ', subtitle: '', author: 'Mara', structure: 'chapters', cover: 'Art/cover.png', language: 'fr-ca', titlePage: false, contents: 'never', copyright: '' });
	eq(JSON.stringify(fm), JSON.stringify({ binder: 1, contents: ['a', 'b'], synopsis: 'Mine', title: 'New', custom: [1, 2], author: 'Mara', structure: 'chapters and scenes', cover: '[[Art/cover.png]]', language: 'fr-CA', 'title-page': false, 'contents-page': 'never' }), 'only Book details’ own properties are written; an empty one is taken out; the rest is as it was');
	applyDetails(fm, { titlePage: true, contents: 'titled', structure: null, language: 'nonsense', cover: '' });
	ok(!('title-page' in fm) && !('contents-page' in fm) && !('structure' in fm) && !('language' in fm) && !('cover' in fm) && fm.title === 'New', 'what is the same as not saying is taken out; a language that isn’t one is never written');
	const before = JSON.stringify(fm);
	applyDetails(fm, {});
	eq(JSON.stringify(fm), before, 'nothing given: nothing changed');
	ok(DETAIL_PROPS.every((k) => !['binder', 'contents', 'synopsis', 'longform'].includes(k)), 'the binder’s own properties are none of them');
}

done('export style');
