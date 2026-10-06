// "Other Alphabets": one binder of short pieces in other scripts and with the typography that trips software up.
// Right-to-left text, Chinese, Japanese and Korean, Greek and Cyrillic, emoji, accents, every kind of dash and
// dot, verse with line breaks, and a chapter of letters. Written by hand; the same few sentences in each language
// (it rained all night; she drank coffee at the window; "What time is it?" "Late. Always late.").
import { binder, scene } from './shape.mjs';

const PIECES = [
	['Hebrew', 'Right to left. Four sentences, with quotation marks.', 'הגשם התחיל בלילה ולא הפסיק עד הבוקר. היא עמדה ליד החלון ושתתה קפה.\n\n"מה השעה?" שאל.\n\n"מאוחר," אמרה. "תמיד מאוחר."\n'],
	['Arabic', 'Right to left, joined letters, its own question mark and comma.', 'بدأ المطر في الليل ولم يتوقف حتى الصباح. وقفت عند النافذة وشربت القهوة.\n\nسأل: «كم الساعة؟»\n\nقالت: «الوقت متأخر، دائمًا متأخر.»\n'],
	['A line in two directions', 'English with Hebrew and Arabic words and numbers inside a line.', 'The sign over the door read שלום and, under it, سلام, and under both, in paint that had run: *open 12–14, closed 1 May*. She copied all three lines into her notebook (the Hebrew first, then the Arabic, then the hours), and could not afterwards say in which direction she had written any of them.\n'],
	['Chinese', 'No spaces between words: a count by characters, and lines that break anywhere.', '雨从夜里开始下，一直下到早晨。她站在窗边，喝着咖啡。\n\n“几点了？”他问。\n\n“很晚了，”她说，“总是很晚。”\n'],
	['Japanese', 'Three scripts in one sentence, and corner brackets for speech.', '雨は夜に降り始め、朝までやまなかった。彼女は窓のそばに立って、コーヒーを飲んだ。\n\n「今、何時ですか」と彼は聞いた。\n\n「遅いわ。いつも遅いの」と彼女は言った。\n'],
	['Korean', 'Hangul, with spaces between words.', '비는 밤에 내리기 시작해서 아침까지 그치지 않았다. 그녀는 창가에 서서 커피를 마셨다.\n\n"지금 몇 시예요?" 그가 물었다.\n\n"늦었어요. 항상 늦어요." 그녀가 말했다.\n'],
	['Greek and Russian', 'Two more alphabets, left to right.', 'Η βροχή άρχισε τη νύχτα και δεν σταμάτησε ως το πρωί. Εκείνη στάθηκε στο παράθυρο και ήπιε καφέ.\n\nДождь начался ночью и не прекращался до утра. Она стояла у окна и пила кофе.\n\n— Который час? — спросил он.\n\n— Поздно, — сказала она. — Всегда поздно.\n'],
	['Emoji', 'Emoji in a sentence: joined ones, flags, skin tones, a keycap.', 'The message said only 🌧️ ☕ 🪟. She answered 👍🏽, then, after a minute, 👩‍👩‍👧, and then 🇵🇹, which was either a holiday or a threat. He sent back 1️⃣ and nothing else.\n\n🌊 A paragraph can begin with one, and end with one 🕓\n'],
	['Accents', 'Names and words with marks: one character, and a letter with a combining mark.', 'The guest list ran: Zoë Brontë-Okafor, Søren Åkesson, Łukasz Dvořák, François Lemaître, Nguyễn Thị Hạnh, Müjde İpekçi of İstanbul, João from São Paulo, Þóra Sigurðardóttir, and a Mr Ó Súilleabháin, who was naïve enough to coöperate.\n\nTwo cafés: café (one character for the é) and café (an e and a combining accent). They should look the same and count the same.\n'],
	['Dashes and dots', 'Typed as people type them: export sets them. Some are already typeset.', 'She said "wait" -- then, more quietly, "\'wait\', I said" -- and then nothing... for a long time.\n\nTyped: two hyphens -- and three --- and three dots... and four dots.... A hyphen in well-meant, a range 1914-18.\n\nAlready set: an em dash — an en dash in 1914–18, an ellipsis… “double” and ‘single’ quotes, and a no-break space in 5\u00A0km.\n\nApostrophes: it\'s the \'90s, rock \'n\' roll, \'tis the dogs\' dinner, and O\'Brien\'s.\n'],
	['Verse', 'Lines that must stay lines: two spaces at a line’s end, a backslash, and a blank line between verses.', 'The tide goes out and takes the light,  \nthe boats lie down like dogs.  \nNobody counts the hours here;  \nthe mud keeps all the clocks.\n\nThe tide comes in and brings the gulls,\\\nthe ropes go taut and sing,\\\nand everything that leaned all night\\\nstands up like anything.\n\n    And this last verse is indented\n    by four spaces, as some poets type,\n    and should not turn into code.\n'],
	['Letters', 'A chapter in letters: addresses, dates, a postscript, a telegram.', '14 Harbour Row  \nCorran  \n3 March 1926\n\nDear Mr Varga,\n\nI am in receipt of yours of the 28th. The door you describe cannot be opened in fifty minutes by anyone I know, and I know everyone.\n\nI remain, &c.,\n\nL.\n\nP.S. Do not write to this address again.\n\n***\n\nGrand Hotel Orsolya  \nRoom 41  \n*Tuesday*\n\nL. --\n\nThen come and tell me so yourself. The 4.10 gets in at nine.\n\nV.\n\n***\n\n> TELEGRAM  \n> ARRIVING NINE STOP BRING NOTHING STOP ESPECIALLY NOT THE PLAN STOP L\n'],
];

export function scripts(add) {
	return binder(add, 'Other Alphabets', { title: 'Other Alphabets', author: 'Various hands', language: 'en-GB', synopsis: 'Short pieces in other scripts, and the marks that software gets wrong.' },
		'Each note is one script or one kind of typography. Its synopsis says what to look for.\n',
		PIECES.map(([name, synopsis, body]) => scene(name, { synopsis, status: 'Done', label: /Hebrew|Arabic|two directions/.test(name) ? 'Purple' : /Chinese|Japanese|Korean/.test(name) ? 'Red' : 'Cyan' }, body)));
}
