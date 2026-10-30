import { VIEW_W, VIEW_H } from '../config.js';

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create() {
    this.add
      .text(VIEW_W / 2, VIEW_H / 2, 'GAZE v0.1', { fontFamily: 'monospace', fontSize: '16px', color: '#cccccc' })
      .setOrigin(0.5);
  }
}
