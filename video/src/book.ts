// The book in the film: six scenes of The Lighthouse, the listing screenshots' novel, in story order.
export type Scene = { name: string; color: 'green' | 'blue' | 'orange' | 'red'; label: string; status: string; words: number; target: number; synopsis: string; when: string };
export const BOOK: Scene[] = [
	{ name: 'Prologue', color: 'green', label: 'The island', status: 'Done', words: 640, target: 600, synopsis: 'The light, seen from the sea, the winter before.', when: 'December 1986' },
	{ name: 'Arrival', color: 'blue', label: 'Mara', status: 'Revised', words: 2140, target: 2000, synopsis: 'The supply boat leaves Mara on the jetty. Nobody comes down to meet her.', when: '11 June 1987' },
	{ name: 'The keeper', color: 'orange', label: 'The keeper', status: 'Revised', words: 1870, target: 2000, synopsis: 'Harrow at the door: nineteen years of the light, and no wish for an assistant.', when: '11 June 1987' },
	{ name: 'Storm warning', color: 'green', label: 'The island', status: 'Draft', words: 1311, target: 2500, synopsis: 'The glass falls all afternoon. The birds leave the rock before the wind comes.', when: '2 October 1987' },
	{ name: 'The wreck', color: 'red', label: 'The wreck', status: 'Draft', words: 2867, target: 3000, synopsis: 'A coaster on the Skerry at two in the morning, burning a flare nobody answers.', when: '3 October 1987' },
	{ name: 'Lights out', color: 'orange', label: 'The keeper', status: 'Draft', words: 1560, target: 2500, synopsis: 'Eleven minutes of dark. What Harrow was doing, and what he says he was doing.', when: '3 October 1987' },
];
