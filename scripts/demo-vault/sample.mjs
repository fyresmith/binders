// A look at the prose a world gives, for whoever is writing stock:  node scripts/demo-vault/sample.mjs [seed] [words]
import { rng } from './core.mjs';
import { text, writer } from './prose.mjs';
import { EN } from './stock/en.mjs';

const world = { person: 3, cast: ['Ines:she', 'Tobias:he', 'Kit:they'], places: ['on the quay', 'in the kitchen', 'at the weighbridge'], things: ['the ledger', 'a coil of rope', 'the brass key'] };
const w = writer(EN, world, rng(process.argv[2] ?? 'sample'));
console.log(text(w.scene({ pov: 'Ines', others: ['Tobias'], words: Number(process.argv[3] ?? 500), opening: 'The tide was out when Ines came down to the quay.' })));
