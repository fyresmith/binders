// Things said, and what is said back: a line, a bar, the reply. Then what people do while they talk, what they
// think, and paragraphs of a few words. Written for this vault.
const pairs = (s) => s.trim().split('\n').map((l) => l.split(' | '));

export const PAIRS = pairs(`
You could have told me. | I didn't think you'd want to know.
How long have you been standing there? | Long enough.
Is it locked? | It was never locked.
I thought you'd gone. | I thought so too.
Say it, then. | I'm trying to.
Who else knows? | Nobody. Not yet.
Have you eaten? | I had something earlier.
You're early. | I couldn't sleep.
Did you bring {thing}? | It's in my coat.
What did they say? | What they always say.
That isn't what happened. | Then tell me what did.
You look tired. | I look like my mother. It isn't the same thing.
Where did you find it? | Where you left it.
I'm not angry. | No. That would be easier.
Sit down, at least. | I'd rather stand.
It's only for a week. | It's always only for a week.
Do you remember the winter the pipes burst? | I remember you remembering it.
Leave it. | I can't leave it.
What's the time? | Later than you think.
You don't have to stay. | I know I don't.
Whose idea was it? | Does that matter now?
I wrote to you. | I know. I read them all.
Is that everything? | It's everything I'm going to say.
Don't. | I wasn't going to.
You're not listening. | I'm listening. I'm just not agreeing.
It was {atplace} this morning. | Then somebody has moved it.
Were you going to tell me? | When there was something to tell.
I can manage. | Nobody said you couldn't.
What do you want me to say? | Something *true* would do.
Has it stopped raining? | It never started.
You kept it. | Somebody had to.
How much? | More than last time.
I'm sorry. | You said. It doesn't change what's owed.
Did he say when? | He said *soon*, which from him means nothing.
We could go back. | Back to what?
Are you cold? | A little. Don't fuss.
You've done this before. | Once. It went badly.
It isn't fair. | No. Was somebody supposed to make it fair?
Give it here. | Mind the edge, it's sharp.
I didn't sleep. | I heard you not sleeping.
What happens now? | Now we wait, I suppose.
You'll write? | I'll try to mean to.
Is that a promise? | It's the nearest thing I've got.
Who told you that? | I worked it out. I'm not a fool.
It's late. | It was late an hour ago.
Do you trust them? | I trust them to be themselves.
Put {thing} somewhere safe. | There isn't anywhere safe. There's just somewhere else.
Why here? | Because nobody comes here.
You're shaking. | It's the cold.
I'd forgotten how quiet it is. | You get so you can't hear it.
Tell me again. | It won't be any different the second time.
I never asked for this. | Nobody does. That's rather the point.
Shall I light the lamp? | Leave it a minute.
Are we agreed? | We're in the same room. Call it that.
What was she like? | Difficult. Kind. Mostly difficult.
You should rest. | I should do a great many things.
It's not what I expected. | What did you expect?
Mind the step. | I've minded it for thirty years.
I can't promise anything. | I'm not asking you to promise.
Listen. | I am.
Was that the door? | It's the wind. It's always the wind.
You're sure. | No. But I'm going to behave as if I were.
`);

export const BEATS = `
did not look up.
shrugged.
looked at the window.
took a long time to answer.
turned the cup round in its saucer.
almost smiled.
shook out the match.
kept on with the work.
glanced at the door.
breathed out slowly.
straightened the papers on the table.
rubbed one eye with the heel of a hand.
considered this.
set the spoon down.
nodded, not in agreement.
was quiet for a moment.
looked at the floor.
pulled a thread from one cuff.
laughed shortly.
went to the window.
`.trim().split('\n');

export const THOUGHTS = `
Not now. Not with everyone watching.
It would keep. Most things kept.
Say something. Anything.
So that was how it would be.
One more day. Then decide.
Too late to ask, and too early to know.
Don't look at the door.
It had seemed so simple on paper.
Somebody ought to have said.
Breathe. Count. Begin again.
There was still time, wasn't there?
Later. All of it, later.
Nobody is coming. Get on with it.
Remember this. Remember exactly this.
As if it had ever been a choice.
Careful, now.
`.trim().split('\n');

export const SHORTS = `
Nothing.
It was enough.
The clock went on.
Nobody came.
{Name} waited.
And that was all.
It did not help.
The door stayed shut.
Then it rained.
{Name} did not answer.
Morning, then.
So.
It would have to do.
A minute passed, and another.
Still nothing.
`.trim().split('\n');

export const TURNS = `
After a while
In the end
For a moment
Later,
By then
Without thinking,
That evening
Once the others had gone,
Before long
All the same,
Toward dusk
For the second time that day
Not long afterwards
At the last moment
More than once that week
`.trim().split('\n');
