import { RADIO_LINE_MS } from '../config.js';

export const RADIO_LINES = {
  start: '관제실이다. 시설이 뚫렸다. WASD로 이동, 마우스로 시선, Shift로 달려라.',
  seen173: 'SCP-173이다. 시선을 떼는 순간 움직인다. 눈을 떼지 마라.',
  blinkWarning: '눈이 깜빡이려 한다. 그 순간이 가장 위험하다.',
  gotKey: '카드키를 확보했다. 출구 문으로 가서 E를 눌러라.',
  noKey: '출구가 잠겨 있다. 카드키부터 찾아라.',
  near096: 'SCP-096이다. 얼굴을 보지 마라.',
  trap: '문이 잠겼군. 기다려라.',
};

// Repeatable events are never recorded as heard; they only skip a fire while the same event is showing or queued.
// 'instruction' has no fixed line: its text (direction, item, rule) is passed to fire().
const REPEATABLE = new Set(['noKey', 'instruction', 'trap']);

/**
 * Lines show one at a time for RADIO_LINE_MS each, in the order they were fired.
 * `alreadyHeard` are non-repeatable events heard earlier in the run; they never play again.
 */
export function createRadio(alreadyHeard = []) {
  const fired = new Set(alreadyHeard.filter((event) => !REPEATABLE.has(event)));
  const scheduled = []; // { event, text, startAt, endAt }
  let lastEndAt = 0;

  return {
    fire(event, nowMs, text = RADIO_LINES[event]) {
      if (REPEATABLE.has(event)) {
        if (scheduled.some((item) => item.event === event && item.endAt > nowMs)) return;
      } else {
        if (fired.has(event)) return;
        fired.add(event);
      }
      const startAt = Math.max(nowMs, lastEndAt);
      const endAt = startAt + RADIO_LINE_MS;
      scheduled.push({ event, text, startAt, endAt });
      lastEndAt = endAt;
    },

    /** Non-repeatable events heard so far, in the order they were first heard. */
    heardEvents() {
      return [...fired];
    },

    current(nowMs) {
      const shown = scheduled.find((item) => item.startAt <= nowMs && nowMs < item.endAt);
      return shown ? shown.text : null;
    },
  };
}
