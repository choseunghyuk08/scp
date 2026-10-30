import { TILE, VIEW_W, VIEW_H, PLAYER } from '../config.js';
import { TEST_MAP_ROWS } from '../data/testmap.js';
import { parseMap } from '../logic/map.js';
import { moveWithCollision } from '../logic/movement.js';
import { createStamina, canRun, stepStamina } from '../logic/stamina.js';
import { clampDt } from '../logic/time.js';
import { visibilityPolygon } from '../logic/vision.js';
import { FogOverlay } from '../render/fog.js';
import { installDebug } from '../debug.js';

const COLORS = { floor: 0x3a3a46, wall: 0x6a6a7c, exit: 0x8a2a2a, player: 0xe8e8e8 };
let generationCounter = 0;

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create(data) {
    this.generation = ++generationCounter;
    this.map = parseMap(data?.rows ?? TEST_MAP_ROWS);
    this.grid = this.map.grid.map((row) => [...row]);
    this.player = { ...this.map.playerStart };
    this.facing = 0;
    this.pointerMoved = false;
    this.aimOverride = null;
    this.stamina = createStamina();
    this.mode = 'playing';

    this.drawMap();
    this.playerGfx = this.add.graphics().setDepth(1001); // above the fog so the player is always visible
    this.fog = new FogOverlay(this);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT');
    this.input.on('pointermove', () => {
      this.pointerMoved = true;
    });
    // Phaser releases held keys itself when the window loses focus; the smoke check "blur releases keys" guards that.

    installDebug(this);
    this.render();
  }

  update(time, deltaMs) {
    const dt = clampDt(deltaMs / 1000);
    if (this.mode !== 'playing') return;

    const k = this.keys;
    let ix = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    let iy = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    const moving = ix !== 0 || iy !== 0;
    if (moving) {
      const len = Math.hypot(ix, iy);
      ix /= len;
      iy /= len;
    }
    const running = k.SHIFT.isDown && moving && canRun(this.stamina);
    this.stamina = stepStamina(this.stamina, dt, running);
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    this.player = moveWithCollision(this.grid, this.player, ix * speed * dt, iy * speed * dt, PLAYER.radius);

    this.facing = this.computeFacing();
    this.render();
  }

  computeFacing() {
    if (this.aimOverride !== null) return this.aimOverride;
    if (!this.pointerMoved) return this.facing;
    const cam = this.cameras.main;
    const pointer = this.input.activePointer;
    const angle = Math.atan2(pointer.y + cam.scrollY - this.player.y, pointer.x + cam.scrollX - this.player.x);
    return Number.isFinite(angle) ? angle : this.facing;
  }

  render() {
    const axis = (p, size, view) =>
      size <= view ? Math.round((size - view) / 2) : Math.round(Math.min(Math.max(p - view / 2, 0), size - view));
    const cam = this.cameras.main;
    cam.setScroll(
      axis(this.player.x, this.map.cols * TILE, VIEW_W),
      axis(this.player.y, this.map.rows * TILE, VIEW_H),
    );

    const { x, y } = this.player;
    this.playerGfx.clear();
    this.playerGfx.fillStyle(COLORS.player, 1).fillCircle(x, y, PLAYER.radius);
    this.playerGfx
      .lineStyle(1, 0xffffff, 1)
      .lineBetween(x, y, x + Math.cos(this.facing) * 9, y + Math.sin(this.facing) * 9);

    this.fog.draw(visibilityPolygon(this.grid, this.player, this.facing), cam, false);
  }

  drawMap() {
    const g = this.add.graphics().setDepth(0);
    for (let ty = 0; ty < this.map.rows; ty++) {
      for (let tx = 0; tx < this.map.cols; tx++) {
        g.fillStyle(this.map.grid[ty][tx] ? COLORS.wall : COLORS.floor, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    const { tx, ty } = this.map.exit;
    g.fillStyle(COLORS.exit, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }
}
