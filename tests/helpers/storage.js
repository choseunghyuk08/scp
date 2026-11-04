/** In-memory stand-in for localStorage. Operations listed in failOn throw, like a blocked or full storage. */
export function createFakeStorage({ failOn = [] } = {}) {
  const data = new Map();
  const guard = (op) => {
    if (failOn.includes(op)) throw new Error(`storage ${op} denied`);
  };
  return {
    data,
    getItem(key) {
      guard('get');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      guard('set');
      data.set(key, String(value));
    },
    removeItem(key) {
      guard('remove');
      data.delete(key);
    },
  };
}
