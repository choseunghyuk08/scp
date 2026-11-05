// Items = { eyedrops, stim }: counts of the two consumables a true side room can hold (D77).

export function createItems() {
  return { eyedrops: 0, stim: 0 };
}

export function addItem(items, kind) {
  return { ...items, [kind]: items[kind] + 1 };
}

/** Spends one of `kind` if there is any; `used` says whether it happened. */
export function useItem(items, kind) {
  if (items[kind] <= 0) return { items, used: false };
  return { items: { ...items, [kind]: items[kind] - 1 }, used: true };
}

/** Eye drops: the blink gauge empties. A blink already under way still finishes. */
export function applyEyedrops(blink) {
  return { ...blink, gauge: 0 };
}
