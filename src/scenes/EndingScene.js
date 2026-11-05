import { ENDING_IDS, FONT, TRANSITION_MS, VIEW_W } from '../config.js';
import { ENDINGS } from '../logic/endings.js';
import { createRun } from '../logic/run.js';
import { clearRun, getStorage, saveRun } from '../save.js';

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/** The ending (D80): its name and lines, how many of the four have been seen, and Space for a new run. No scores. */
export class EndingScene extends Phaser.Scene {
  constructor() {
    super('Ending');
  }

  create({ endingId, seen }) {
    this.endingId = endingId;
    this.seen = [...seen];
    const ending = ENDINGS[endingId];
    const text = (y, value, size, color) =>
      this.add
        .text(VIEW_W / 2, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center', wordWrap: { width: 440 } })
        .setOrigin(0.5);

    text(48, ending.name, 20, '#f0f0f0');
    ending.lines.forEach((line, i) => text(92 + i * 22, line, 10, '#c8c8d0'));
    text(176, `본 엔딩 ${this.seen.length}/${ENDING_IDS.length}`, 10, '#9090a0');
    text(194, ENDING_IDS.map((id) => (this.seen.includes(id) ? ENDINGS[id].name : '???')).join(' · '), 10, '#9090a0');
    text(236, 'Space로 새 판', 11, '#80ff80');

    this.input.keyboard.on('keydown-SPACE', () => this.startNewRun());
    this.cameras.main.fadeIn(TRANSITION_MS);
  }

  startNewRun() {
    const storage = getStorage();
    clearRun(storage);
    const run = createRun(randomSeed());
    saveRun(run, storage);
    this.scene.start('Play', { run });
  }
}
