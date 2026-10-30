/** '#' = wall (true), anything else = floor (false). Indexed grid[ty][tx]. */
export function gridFrom(rows) {
  return rows.map((row) => [...row].map((ch) => ch === '#'));
}
