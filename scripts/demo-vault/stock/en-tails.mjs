// Half-sentences that close: each follows any lead (en-leads.mjs) and ends the sentence. Written for this vault.
export const TAILS = `
, and for a while nothing else happened.
, though it made no difference.
, as if that settled it.
, which was not like {him}.
 and did not look back.
, the way it had been done in that house for years.
 and tried to think of nothing.
, because the alternative was to speak.
 until the light changed.
, and the afternoon went on without {him}.
, listening.
, and was ashamed of how easy it was.
 while the kettle came to the boil.
, and then, for no reason, did it again.
, more out of habit than hope.
 before anyone could ask.
, and the quiet afterwards had a shape to it.
, counting under {her} breath.
 and let the minute go by.
, though nobody had asked {him} to.
, and felt the day tilt a little.
, not for the first time that week.
 and then thought better of it.
, and somewhere below a door banged.
, as people do when they are waiting to be found out.
 with more care than it needed.
, and the cold came in at the ankles.
, which told {him} nothing.
 and was sorry at once.
, half hoping to be stopped.
, slowly, like someone carrying water.
, and outside the gulls went on with their argument.
 as though it were an ordinary day.
, and that was the whole of the morning.
, and the smell of coal smoke came in with the draught.
 without deciding to.
, and nobody noticed.
, with the patience of someone who has run out of other things.
 and wondered who else knew.
, and was glad of the dark.
, the old boards giving under {her} feet.
, and it was only then that {she} saw the time.
 for as long as {she} could stand it.
, and afterwards could not have said why.
, because it was easier than going home.
, and the clock in the hall struck the half hour.
 and kept {her} face still.
, since there was nobody to see.
, which was as close to an answer as {she} would get.
, and the wind got into everything.
, twice, to be sure.
 and listened to it settle.
, as {her} mother would have done.
, and a dog began barking two streets away.
, and the room seemed smaller for it.
, a little at a time.
 and felt better, and then worse.
, and the day was nearly gone.
, with the window still open.
, the way one touches a bruise.
`.trim().split('\n').map((t) => t.replace(/^(?=[a-z])/, ' '));

export const TAILS_WITH = `
, and {O} pretended not to see.
, and {O} let {him}.
 while {O} talked about the weather.
, and {O} went on as though nothing had been said.
, which made {O} laugh.
, and {O} looked away first.
 before {O} could object.
, and {O} said nothing, which was worse.
, and {O} watched {him} do it.
, knowing {O} would notice.
, and {O} shut the door on the noise.
, and neither of them mentioned it again.
, and {O} waited, as {oshe} always did.
, with {O} standing too close.
, and {O} took that for agreement.
, and {O}'s hands were shaking.
`.trim().split('\n').map((t) => t.replace(/^(?=[a-z])/, ' '));
