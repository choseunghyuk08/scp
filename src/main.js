import { VIEW_W, VIEW_H } from './config.js';
import { PlayScene } from './scenes/PlayScene.js';

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [PlayScene],
});

window.__game = game;
