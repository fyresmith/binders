# Focus mode

Focus mode is for writing a note of a binder with nothing else on the screen: the text, in your vault's own type
and line length, and one button to leave.

![A note in focus mode: the text alone on a charcoal page, the paragraph being written at full strength and the others stepped back](images/focus-mode.png)

It works for a note in its own tab, editing or reading, and for the manuscript. A note that isn't in a binder is
left exactly as Obsidian has it.

## Going in and out

**To go in:**

- run **Toggle focus mode** from the command palette (give it a hotkey of your own in Obsidian's Hotkeys settings);
- click the **Focus mode** button in the header of any note of a binder;
- click the button at the end of the manuscript's toolbar.

**To leave:**

- press **Esc**;
- click the leave button at the top right, which comes back when the pointer moves;
- run **Toggle focus mode** again.

Nothing of Obsidian's is closed or rearranged to do this. The sidebars, tabs, other panes and the status bar are out
of sight while you write, and exactly where they were when you leave.

Dialogs, menus and the command palette open over the page as usual, and take Esc first. With Vim key bindings on,
Esc is Vim's: use the button or the command.

## What is on to begin with

Three options are on when you first use focus mode. Turn any of them off in Binders' settings or in
[focus mode's menu](#the-menu).

### Typewriter scrolling

While you write at the end of a scene, the line you're on stays at one height, a little above the middle, and the
page moves under it. Go back up to change something and the page scrolls as it always does. The page never moves
because you clicked.

### Dim other paragraphs

While you type, every paragraph but the one you're in steps well back, to about a third of its strength. So do the
tables, callouts and images between them, and the scenes before and after. They are there to be seen, not read.
Move the pointer and everything is at full strength again.

### Dim the background

The page is a deep charcoal, almost black, with light text on it, whatever your theme. In a light theme too: the
whole window takes Obsidian's dark colors (your theme's own, if it has them) while you're in focus, and is exactly
as it was when you leave. Turn it off to write on your theme's own page.

## What you can turn on

These are off until you turn them on.

| Option | What it does |
|---|---|
| **Show the scenes before and after** | In a note, the end of the scene before is shown above its text and the start of the scene after below it, as in the manuscript. Click one to go there |
| **Show where you are** | The scene's place in the binder ("Part One › Arrival") and its synopsis, as a note in the margin, or a strip along the top where there's no margin. They go while you type |
| **Show word counts** | The scene's words, with its target, and the words written today in the binder, where the status bar was. They go while you type and come back when you pause |
| **Enter fullscreen** | Focus mode takes the whole screen and gives it back when you leave. Esc leaves both. Not on phones and tablets |
| **Words to write today** | A goal for the day. See below |

## The menu

Focus mode has its own menu. Open it by right-clicking the leave button or the text, or by clicking the word
counts. It has:

- the binder's word count, and its target if it has one;
- every option above, to tick or untick;
- **Set a goal for today...** (or **Change today's goal...**) and **Start counting from here**;
- **Previous scene** and **Next scene**, each naming the scene;
- **Leave focus mode**.

The same options are under **Settings → Binders → Focus mode**.

## Moving between scenes

**Go to previous scene** and **Go to next scene** move through the binder in its order without leaving focus. They
are commands, for a note of a binder or in the manuscript, in focus mode or out of it. Give them hotkeys if you use
them often.

## Word counts and a goal for the day

With **Show word counts** on, focus mode shows the scene's words and the words written today in the binder.

- **Words to write today** is a goal for a day's writing in a binder. Set it in settings, or with **Set a goal for
  today...** in the menu. When it's reached the count turns the color of a target met, and nothing else happens.
- **The words written today** are the day's net change in the binder's notes. They are counted whether you're in
  focus or not.
- They are kept on the device you write on, not in your notes and not in the plugin's settings. So they don't sync:
  each device counts its own.
- **Start counting from here**, in the menu, starts the day again.

## On a phone

On a phone Obsidian's bar of buttons and the note's header go. The way out is at the top, under the clock, with the
place and the word counts beside it if they're on. It goes while you type and comes back when you touch the page.
The keyboard's own toolbar stays. Press and hold the leave button for the menu.

## Limits

- Focus mode hides parts of Obsidian's window by their names in its style sheet. If an Obsidian update renames one,
  that part stays in sight while you write; nothing else changes.
- **Enter fullscreen** isn't available on phones and tablets.
- Going to another tab or pane leaves focus mode.

Next: [Export](export.md)
