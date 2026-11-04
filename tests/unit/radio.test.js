import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRadio, RADIO_LINES } from '../../src/logic/radio.js';

test('every radio event has a Korean line', () => {
  assert.deepEqual(Object.keys(RADIO_LINES).sort(), ['blinkWarning', 'gotKey', 'noKey', 'seen173', 'start']);
  for (const line of Object.values(RADIO_LINES)) assert.match(line, /[가-힣]/);
});

test('nothing before fire', () => assert.equal(createRadio().current(0), null));

test('a fired line shows for 4000ms', () => {
  const r = createRadio();
  r.fire('start', 0);
  assert.equal(r.current(0), RADIO_LINES.start);
  assert.equal(r.current(3999), RADIO_LINES.start);
  assert.equal(r.current(4000), null);
});

test('lines queue FIFO', () => {
  const r = createRadio();
  r.fire('start', 0);
  r.fire('seen173', 100);
  assert.equal(r.current(3999), RADIO_LINES.start);
  assert.equal(r.current(4000), RADIO_LINES.seen173);
  assert.equal(r.current(7999), RADIO_LINES.seen173);
  assert.equal(r.current(8000), null);
});

test('non-repeatable events fire once', () => {
  const r = createRadio();
  r.fire('start', 0);
  r.fire('start', 9000);
  assert.equal(r.current(9000), null);
});

test('noKey repeats only when not already shown or queued', () => {
  const r = createRadio();
  r.fire('noKey', 0);
  r.fire('noKey', 100);
  assert.equal(r.current(4000), null);
  r.fire('noKey', 5000);
  assert.equal(r.current(5000), RADIO_LINES.noKey);
  assert.equal(r.current(9000), null);
});

test('noKey queued behind another line is not queued twice', () => {
  const r = createRadio();
  r.fire('start', 0);
  r.fire('noKey', 100);
  r.fire('noKey', 200);
  assert.equal(r.current(4000), RADIO_LINES.noKey);
  assert.equal(r.current(8000), null);
});

test('events passed as alreadyHeard are ignored by fire', () => {
  const r = createRadio(['start']);
  r.fire('start', 0);
  assert.equal(r.current(0), null);
});

test('heardEvents lists fired non-repeatable events in order, including the initial ones', () => {
  const r = createRadio(['start']);
  r.fire('seen173', 0);
  r.fire('gotKey', 10);
  assert.deepEqual(r.heardEvents(), ['start', 'seen173', 'gotKey']);
});

test('noKey is never recorded as heard, even when passed in', () => {
  const r = createRadio(['noKey']);
  r.fire('noKey', 0);
  assert.equal(r.current(0), RADIO_LINES.noKey);
  assert.deepEqual(r.heardEvents(), []);
});

test('createRadio() without an argument behaves as before', () => {
  const r = createRadio();
  r.fire('start', 0);
  r.fire('start', 10);
  assert.equal(r.current(0), RADIO_LINES.start);
  assert.deepEqual(r.heardEvents(), ['start']);
});

test('heardEvents returns a copy', () => {
  const r = createRadio(['start']);
  r.heardEvents().push('gotKey');
  assert.deepEqual(r.heardEvents(), ['start']);
});
