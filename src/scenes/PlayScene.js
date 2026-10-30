import { TILE, VIEW_W, VIEW_H, PLAYER } from '../config.js';
import { TEST_MAP_ROWS } from '../data/testmap.js';
import { createBlink, isBlinking, stepBlink } from '../logic/blink.js';
import { parseMap } from '../logic/map.js';
import { moveWithCollision } from '../logic/movement.js';
import { create173, isLethal, step173 } from '../logic/scp173.js';
import { createStamina, canRun, stepStamina } from '../logic/stamina.js';
import { clampDt } from '../logic/time.js';
import { canSee, visibilityPolygon } from '../logic/vision.js';
import { FogOverlay } from '../render/fog.js';
import { installDebug } from '../debug.js';

const COLORS = { floor: 0x3a3a46, wall: 0x6a6a7c, exit: 0x8a2a2a, player: 0xe8e8e8, scp173: 0xd8d0a8 };
const FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
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
    this.blink = createBlink();
    this.scp = this.map.spawns173.map(create173);
    this.observed = this.scp.map(() => false);
    this.mode = 'playing';

    this.drawMap();
    this.scpGfx = this.add.graphics().setDepth(5);
    this.playerGfx = this.add.graphics().setDepth(1001); // above the fog so the player is always visible
    this.fog = new FogOverlay(this);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT');
    this.input.on('pointermove', () => {
      this.pointerMoved = true;
    });
    // Event-driven (not Key.JustDown) so a tap shorter than one frame still restarts. Scene-owned, so it is
    // removed on shutdown and restarts never stack listeners.
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.mode === 'dead') this.scene.restart();
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

    this.blink = stepBlink(this.blink, dt);
    const blinking = isBlinking(this.blink);
    this.observed = this.scp.map((s) => !blinking && canSee(this.grid, this.player, this.facing, s.pos));
    this.scp = this.scp.map((s, i) =>
      step173(s, { dt, grid: this.grid, player: this.player, observed: this.observed[i] }),
    );
    if (this.scp.some((s) => isLethal(s, this.player))) this.die();

    this.render();
  }

  die() {
    this.mode = 'dead';
    this.add
      .text(VIEW_W / 2, VIEW_H / 2, 'D-9341 사망 — Space로 재시작', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ff4040',
        backgroundColor: '#000000',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2000);
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

    // 173 is drawn only while the player is actually looking at it.
    this.scpGfx.clear();
    this.scp.forEach((s, i) => {
      if (this.observed[i]) this.scpGfx.fillStyle(COLORS.scp173, 1).fillRect(s.pos.x - 5, s.pos.y - 5, 10, 10);
    });

    this.fog.draw(visibilityPolygon(this.grid, this.player, this.facing), cam, isBlinking(this.blink));
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
