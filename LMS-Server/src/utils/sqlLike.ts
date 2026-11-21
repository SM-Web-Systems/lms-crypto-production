/** A bound `LIKE ? ESCAPE '\'` value that matches `term` as literal text anywhere in the column. */
export function likeContains(term: string): string {
  return `%${term.replace(/[\%_]/g, (c) => `\${c}`)}%`;
}
