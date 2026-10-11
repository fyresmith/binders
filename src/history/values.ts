/** Are two property values the same, as written (a list by what's in it; none and null alike)? */
export const sameValue = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
