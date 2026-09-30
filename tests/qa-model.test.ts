// QA findings in the pure binder model (src/model.ts), kept as regressions.
import { readIndex } from '../src/model';
import { done, eq } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// a hand-typed entry YAML reads as a number (a note called "1984") keeps its place
{
	const idx = readIndex({ binder: 1, contents: ['Prologue', 1984, 'Epilogue'] });
	eq(j(idx.contents), j(['Prologue', '1984', 'Epilogue']), 'a numeric entry is read as its text');
}

done('qa-model');
