/** A key that only acts when pressed twice within `windowMs` (so one stray press cannot wipe progress). */
export function createDoublePress(windowMs) {
  let armedAt = null;
  const armed = (nowMs) => armedAt !== null && nowMs - armedAt <= windowMs;
  return {
    press(nowMs) {
      if (armed(nowMs)) {
        armedAt = null;
        return 'confirmed';
      }
      armedAt = nowMs;
      return 'armed';
    },
    isArmed: armed,
  };
}
