import { movedPin, ownNames, pinProblem, readPins, withoutPin, withPin } from '../src/inspector/pins';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const SETTINGS = { synopsisProp: 'synopsis', statusProp: 'status', labelProp: 'label', targetProp: 'target', storyDateProp: 'story-date', storyOrderProp: 'story-order', notesProp: 'notes' };

// reading what a binder note has
{
	eq(j(readPins(['pov', 'characters'])), j(['pov', 'characters']), 'a list, in its order');
	eq(j(readPins(undefined)), j([]), 'nothing written: nothing pinned');
	eq(j(readPins(null)), j([]), 'null: the same');
	eq(j(readPins('pov')), j(['pov']), 'a lone name is one pin');
	eq(j(readPins({ a: 1 })), j([]), 'a map is nothing');
	eq(j(readPins(7)), j([]), 'a number is nothing');
	eq(j(readPins([' pov ', 'Pov', 'POV', 'place'])), j(['pov', 'place']), 'trimmed, and a name once whatever its case');
	eq(j(readPins(['pov', 3, null, '', '  ', { x: 1 }, ['y'], 'place'])), j(['pov', 'place']), 'only names are read');
}

// writing: what isn't understood is kept where it was
{
	eq(j(withPin(['pov'], 'place')), j(['pov', 'place']), 'a pin is added last');
	eq(j(withPin(['pov', 3, { x: 1 }], 'place')), j(['pov', 3, { x: 1 }, 'place']), 'entries it does not understand stay');
	eq(j(withPin(undefined, 'pov')), j(['pov']), 'to nothing');
	eq(j(withPin('pov', 'place')), j(['pov', 'place']), 'a lone name becomes a list');
	eq(j(withPin(['pov'], 'POV')), j(['pov']), 'a name already there, whatever its case, is not added again');
	eq(j(withPin({ x: 1 }, 'pov')), j([{ x: 1 }, 'pov']), 'a value that is not a list is kept as an entry, not dropped');

	eq(j(withoutPin(['pov', 'place'], 'pov')), j(['place']), 'a pin taken away');
	eq(j(withoutPin(['pov', 'place'], 'POV')), j(['place']), 'by any case');
	eq(j(withoutPin(['pov', 3], 'pov')), j([3]), 'what is not a name stays');
	eq(withoutPin(['pov'], 'pov'), undefined, 'the last one: the property goes');
	eq(withoutPin('pov', 'pov'), undefined, 'a lone name taken away: the property goes');
	eq(j(withoutPin(['pov', 'pov'], 'pov')), j(undefined), 'twice there, both go');

	eq(j(movedPin(['a', 'b', 'c'], 'b', -1)), j(['b', 'a', 'c']), 'up');
	eq(j(movedPin(['a', 'b', 'c'], 'b', 1)), j(['a', 'c', 'b']), 'down');
	eq(j(movedPin(['a', 'b', 'c'], 'a', -1)), j(['a', 'b', 'c']), 'the first does not go up');
	eq(j(movedPin(['a', 'b', 'c'], 'c', 1)), j(['a', 'b', 'c']), 'the last does not go down');
	eq(j(movedPin(['a', 7, 'b'], 'b', -1)), j(['b', 7, 'a']), 'past what is not a name: names swap, the rest stays where it is');
	eq(j(movedPin(['a', 'b'], 'zzz', 1)), j(['a', 'b']), 'a name not there: nothing');
}

// what can't be pinned
{
	const own = ownNames(SETTINGS);
	for (const n of ['status', 'Label', 'SYNOPSIS', 'target', 'story-date', 'story-order', 'notes', 'export', 'compile', 'export-as', 'binder', 'contents', 'longform', 'inspector', 'title', 'author', 'structure', 'language', 'cover', 'copyright', 'title-page', 'contents-page', 'page-size', 'manuscript-style', 'book-style']) ok(own.has(n.toLowerCase()), `${n} is Binders' own`);
	for (const n of ['pov', 'characters', 'location', 'subplot', 'tags', 'aliases']) ok(!own.has(n), `${n} is the writer's`);
	eq(pinProblem('status', [], SETTINGS) !== null, true, 'a name of Binders’ own is refused');
	ok(/Status/.test(pinProblem(' Status ', [], SETTINGS) ?? ''), 'and the refusal names it');
	eq(pinProblem('pov', ['POV'], SETTINGS), 'pov is pinned already.', 'a pin twice is refused, by any case');
	ok(pinProblem('   ', [], SETTINGS) !== null, 'nothing typed');
	ok(pinProblem('a: b', [], SETTINGS) !== null, 'a colon would not be a name');
	eq(pinProblem('pov', [], SETTINGS), null, 'a name of the writer’s');
	const custom = { ...SETTINGS, statusProp: 'state', labelProp: 'Colour' };
	ok(pinProblem('state', [], custom) !== null, 'the status as settings spell it');
	ok(pinProblem('colour', [], custom) !== null, 'the label as settings spell it, by any case');
	eq(pinProblem('status', [], custom), null, 'and a name settings no longer use is the writer’s');
}

done('inspector pins');
