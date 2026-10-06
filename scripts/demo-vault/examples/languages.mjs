// Two short books in other languages, each with `language` set in its binder note, so that export sets their
// quotes as the language has them: „German“ and « French ». Written by hand, typed with straight quotes, two
// hyphens for a dash and three full stops, as most people type. Kept short so that it can be correct.
import { binder, scene } from './shape.mjs';

const DE = [
	['Der Uhrmacher', 'Ein Fremder fragt, seit wann die Turmuhr steht.', `Die Turmuhr von Sankt Veit war seit dem Krieg nicht mehr gegangen. Niemand im Dorf vermisste sie, bis der neue Uhrmacher kam.

"Sie steht auf zehn nach vier", sagte er zur Wirtin. "Seit wann?"

"Seit ich denken kann", sagte sie. "Und ich denke schon lange."

Er lachte nicht. Er stellte seinen Koffer ab, trat ans Fenster und sah lange zum Turm hinauf.
`],
	['Im Turm', 'Das Uhrwerk ist nicht kaputt. Jemand hat es angehalten.', `Am nächsten Morgen stieg er hinauf. Die Treppe war eng, das Holz weich vom Alter, und oben roch es nach Staub und Tauben.

Das Uhrwerk war nicht zerbrochen. Jemand hatte es angehalten: Zwischen zwei Zahnrädern steckte ein Löffel aus Zinn.

*Wer hält eine Uhr mit einem Löffel an?*, dachte er. *Und warum um zehn nach vier?*

Er ließ den Löffel, wo er war, und ging wieder hinunter.
`],
	['Zehn nach vier', 'Die Wirtin erzählt, wer die Zeit angehalten hat.', `"Das war mein Vater", sagte die Wirtin. Sie stellte ihm die Suppe hin und setzte sich nicht. "Um zehn nach vier kam der Brief. Er ist hinaufgestiegen und hat die Zeit angehalten -- so hat er es genannt."

"Und Sie haben sie nie wieder in Gang gesetzt."

"Wozu? Im Dorf weiß jeder, wie spät es ist. Nur nicht, welcher Tag ..."

Der Uhrmacher aß seine Suppe. "Wie geht's Ihrem Vater heute?", fragte er schließlich.

Draußen wurde es dunkel, und die Uhr zeigte weiter die einzige Stunde, die in Sankt Veit je gezählt hatte.
`],
];

const FR = [
	['Le passeur', 'Le dernier bac part à minuit, avec une seule passagère.', `Le dernier bac quittait la rive à minuit, qu'il y eût des passagers ou non. Cette nuit-là, il n'y en avait qu'une.

"Vous allez jusqu'au bout ?" demanda le passeur.

"Jusqu'à l'autre rive", dit-elle. "Ce n'est pas le bout."

Il haussa les épaules et largua l'amarre. Le fleuve était noir, large, et parfaitement indifférent.
`],
	['Au milieu du fleuve', 'Le passeur coupe le moteur, comme chaque nuit.', `À mi-chemin, le moteur s'arrêta. Ce n'était pas une panne : le passeur avait coupé le contact.

"Écoutez", dit-il.

Elle écouta. Il n'y avait rien -- ni la ville, ni les chiens, ni même l'eau contre la coque. Seulement le silence, énorme, posé sur le fleuve comme un couvercle.

"Je m'arrête ici chaque nuit", dit le passeur. "C'est le seul endroit où personne ne me demande rien."

*Sauf moi*, pensa-t-elle, mais elle se tut.
`],
	['L’autre rive', 'Elle descend sans se retourner.', `Ils accostèrent un peu après une heure. Elle descendit sans se retourner, sa valise à la main.

"Vous reviendrez ?" lança le passeur.

"Pas par le bac."

Il rit, remit le moteur en marche et repartit vers la rive d'où ils venaient. Derrière lui, sur le quai désert, la jeune femme regardait déjà ailleurs... vers les lumières, vers la route, vers tout ce qui n'était pas le fleuve.
`],
];

const book = (name, props, about, chapters) => (add) => binder(add, name, props, about, chapters.map(([title, synopsis, body], i) => scene(title, { synopsis, status: i < 2 ? 'Done' : 'Revised', target: 150 }, body)));

export const german = book('Die Uhr von Sankt Veit', { title: 'Die Uhr von Sankt Veit', author: 'Katharina Lenz', language: 'de', synopsis: 'Ein Uhrmacher, eine stehende Turmuhr und ein Löffel aus Zinn.' },
	'Drei kurze Kapitel. `language: de`: beim Export werden die geraden Anführungszeichen zu „deutschen“.\n', DE);
export const french = book('Le Bac de minuit', { title: 'Le Bac de minuit', author: 'Hélène Marchais', language: 'fr', synopsis: 'Un passeur, une passagère et le silence au milieu du fleuve.' },
	'Trois courts chapitres. `language: fr` : à l’export, les guillemets droits deviennent des guillemets « français ».\n', FR);
