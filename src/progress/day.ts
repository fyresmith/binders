/* The record's day. A day ends at four in the morning, local time, with no setting: a writer at the page at half
   past midnight is still on the day that is ending (Scrivener's and Keep the Rhythm's midnight is the commonest
   complaint about their counters). Pure. */

export const DAY_STARTS = 4;

const pad = (n: number): string => String(n).padStart(2, '0');

/** The record's day (YYYY-MM-DD) a moment falls on: the calendar day in local time, or the one before when it is
    earlier than four in the morning. Subtracted as a calendar day, not as hours, so a clock that changes in the night
    doesn't move it. */
export function recordDay(at: Date | number): string {
	const d = new Date(typeof at === 'number' ? at : at.getTime());
	if (d.getHours() < DAY_STARTS) d.setDate(d.getDate() - 1);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The clock's hour (0 to 23) a moment falls in. */
export const hourOf = (at: Date | number): number => new Date(typeof at === 'number' ? at : at.getTime()).getHours();

/** The year of a record day, which decides the file it is kept in. */
export const yearOf = (day: string): number => Number(day.slice(0, 4));
