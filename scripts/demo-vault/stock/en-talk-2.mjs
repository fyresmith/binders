// More things said and said back, thought, and put in a paragraph of their own (see en-talk.mjs). Written for this
// vault.
export const PAIRS_2 = `
Who was at the door? | Nobody we know.
You've changed something in here. | I moved the table. It's allowed.
Did you mean it? | At the time.
How bad is it? | Bad enough that I'm telling you.
I saw the light on. | I wasn't hiding.
Where will you go? | I hadn't got as far as *where*.
Take {thing} with you. | It isn't mine to take.
She asked after you. | What did you tell her?
I can pay. | It was never about the money.
Let me carry that. | It's lighter than it looks.
You knew. | I guessed. That isn't the same.
Have they gone? | An hour ago. You can come out.
Is it far? | Farther than it used to be.
I won't ask again. | Good.
You never liked this house. | I never said so.
What are you looking for? | I'll know when it's found.
Stay for supper. | I've stayed too long as it is.
It wants mending. | Everything wants mending.
He left this for you. | When?
Do you think they believed us? | I think they wanted to.
You'll catch cold. | Then I'll catch it.
There's a letter. | There's always a letter.
Was I wrong? | You were early. People forgive wrong sooner.
I thought I heard you come in. | I've been here all the time.
Tell me the worst of it. | You're sitting in it.
Can it be done by Thursday? | It can be done. Thursday is another matter.
I'd have come sooner. | You came. Let that be enough.
What did it cost you? | Ask me in a year.
Are you staying? | I haven't unpacked. Make of that what you like.
It's not your fault. | That's kind. It isn't true, but it's kind.
We should say something. | To whom?
Read it to me. | You won't like it.
I looked for you {atplace}. | I wasn't there.
Does it hurt? | Only when I think about it.
You sound like him. | That's the cruellest thing you've said yet.
Come away from the window. | In a minute.
I kept your place. | I didn't ask you to.
Who gave you the key? | It was on the nail. It's always on the nail.
What will people say? | What they said last time, with fresh detail.
I'm going up. | Leave the door.
Is this all of it? | All I could find.
You were gone a long while. | I walked. I needed to walk.
Then it's settled. | It's decided. I wouldn't call it settled.
Give me a day. | You've had a month.
Don't tell the others. | They'll know by morning. They always do.
How do you bear it? | Badly. But daily.
Start at the beginning. | There isn't one. That's the difficulty.
I brought you something. | You shouldn't have. What is it?
Was it always like this? | No. It was worse, and we were younger.
Shut the door. | It is shut.
What's that you've got? | Only {thing}.
You could come with me. | I could.
I don't understand you. | You understand me perfectly. You don't *like* it.
Is there any tea? | There's what's in the pot.
It won't happen again. | That's what worries me.
They want an answer. | They can want.
Why didn't you write? | I did. I didn't send them.
How long will it take? | As long as it takes, and then a week.
I'm afraid. | Yes. So am I. Pass me that.
Nobody blames you. | Nobody says so. It's different.
`.trim().split('\n').map((l) => l.split(' | '));

export const THOUGHTS_2 = `
Too quiet. Much too quiet.
Was that all? It couldn't be all.
Not yet.
Ask. Just ask.
Of course. Of course it was.
Keep walking.
Tomorrow, then. Tomorrow without fail.
What had been the word for it?
Let them think so.
Nothing to be done tonight.
Slowly. There was no prize for haste.
And if it was true?
Home. Whatever that meant now.
Twice in one week.
Enough.
Why today, of all days?
Hold on to that.
No one would thank {him} for it.
So it had started.
There. That was the sound.
`.trim().split('\n');

export const SHORTS_2 = `
That was Tuesday.
It was not much.
Nobody spoke.
The kettle boiled.
It grew dark.
{Name} slept badly.
The post came.
It was a start.
Then the bell.
The light went.
There was no reply.
{Name} let it go.
Rain again.
The week went by.
It could wait.
The fire was out.
Nobody asked.
So it was true.
{Name} went on.
Not a word.
Something had shifted.
Then it was evening.
The house settled.
It held.
That was the last of it.
`.trim().split('\n');
