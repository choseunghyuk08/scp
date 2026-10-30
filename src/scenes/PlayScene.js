import { TILE, VIEW_W, VIEW_H, PLAYER, KEY_PICKUP_DIST, EXIT_INTERACT_DIST } from '../config.js';
import { playBeep } from '../audio/beep.js';
import { TEST_MAP_ROWS } from '../data/testmap.js';
import { createBlink, isBlinking, stepBlink } from '../logic/blink.js';
import { tileCenter } from '../logic/grid.js';
import { parseMap } from '../logic/map.js';
import { moveWithCollision } from '../logic/movement.js';
import { createRadio } from '../logic/radio.js';
import { create173, isLethal, step173 } from '../logic/scp173.js';
import { createStamina, canRun, stepStamina } from '../logic/stamina.js';
import { clampDt } from '../logic/time.js';
import { canSee, visibilityPolygon } from '../logic/vision.js';
import { FogOverlay } from '../render/fog.js';
import { installDebug } from '../debug.js';

const COLORS = {
  floor: 0x3a3a46,
  wall: 0x6a6a7c,
  exit: 0x8a2a2a,
  player: 0xe8e8e8,
  scp173: 0xd8d0a8,
  key: 0xf0d040,
};
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
    this.hasKey = false;
    this.radio = createRadio();
    this.shownLine = null;
    this.mode = 'playing';

    this.drawMap();
    this.keyGfx = this.add.graphics().setDepth(4);
    this.keyGfx
      .fillStyle(COLORS.key, 1)
      .fillRect(this.map.cardKey.x - 3, this.map.cardKey.y - 3, 6, 6);
    this.scpGfx = this.add.graphics().setDepth(5);
    this.playerGfx = this.add.graphics().setDepth(1001); // above the fog so the player is always visible
    this.fog = new FogOverlay(this);
    this.buildHud();

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT');
    this.input.on('pointermove', () => {
      this.pointerMoved = true;
    });
    // Event-driven (not Key.JustDown) so a tap shorter than one frame still registers. Scene-owned, so they
    // are removed on shutdown and restarts never stack listeners.
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.mode === 'dead' || this.mode === 'escaped') this.scene.restart();
    });
    this.input.keyboard.on('keydown-E', () => this.tryInteract());
    // Phaser releases held keys itself when the window loses focus; the smoke check "blur releases keys" guards that.

    this.radio.fire('start', this.nowMs());
    installDebug(this);
    this.render();
  }

  nowMs() {
    return performance.now();
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

    const now = this.nowMs();
    if (this.observed.some(Boolean)) this.radio.fire('seen173', now);
    if (this.blink.gauge >= 0.8) this.radio.fire('blinkWarning', now);
    if (!this.hasKey && Math.hypot(this.player.x - this.map.cardKey.x, this.player.y - this.map.cardKey.y) <= KEY_PICKUP_DIST) {
      this.pickUpKey();
    }
    if (this.scp.some((s) => isLethal(s, this.player))) this.die();

    this.render();
  }

  pickUpKey() {
    this.hasKey = true;
    this.keyGfx.clear();
    this.radio.fire('gotKey', this.nowMs());
    playBeep(1320, 150);
  }

  tryInteract() {
    if (this.mode !== 'playing') return;
    const door = tileCenter(this.map.exit.tx, this.map.exit.ty);
    if (Math.hypot(door.x - this.player.x, door.y - this.player.y) > EXIT_INTERACT_DIST) return;
    if (!this.hasKey) {
      this.radio.fire('noKey', this.nowMs());
      return;
    }
    const { tx, ty } = this.map.exit;
    this.grid[ty][tx] = false;
    this.exitGfx.clear().fillStyle(COLORS.floor, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
    this.mode = 'escaped';
    playBeep(660, 300);
    this.showBanner('탈출 성공 — v0.1 끝. Space로 다시', '#80ff80');
  }

  die() {
    this.mode = 'dead';
    playBeep(90, 450, 0.08);
    this.showBanner('D-9341 사망 — Space로 재시작', '#ff4040');
  }

  showBanner(text, color) {
    this.add
      .text(VIEW_W / 2, VIEW_H / 2, text, {
        fontFamily: FONT,
        fontSize: '14px',
        color,
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
    this.renderHud();
  }

  buildHud() {
    const label = (x, y, text) =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: '8px', color: '#b0b0c0' }).setScrollFactor(0).setDepth(2001);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(2000);
    label(8, VIEW_H - 25, '스태미너');
    label(84, VIEW_H - 25, '눈');
    this.keyText = this.add
      .text(VIEW_W - 8, 8, '[카드키]', { fontFamily: FONT, fontSize: '10px', color: '#f0d040' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(2001)
      .setVisible(false);
    this.radioText = this.add
      .text(VIEW_W / 2, 6, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#9cff9c',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 },
        align: 'center',
        wordWrap: { width: 360 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2001)
      .setVisible(false);
  }

  renderHud() {
    const bar = (x, y, ratio, color) => {
      this.hud.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, 66, 6);
      this.hud.fillStyle(color, 1).fillRect(x, y, 64 * ratio, 4);
    };
    this.hud.clear();
    bar(8, VIEW_H - 14, this.stamina.value, this.stamina.exhausted ? 0xc04040 : 0x60c060);
    bar(84, VIEW_H - 14, this.blink.gauge, this.blink.gauge >= 0.8 ? 0xe0c040 : 0x8080e0);
    this.keyText.setVisible(this.hasKey);

    const line = this.radio.current(this.nowMs());
    if (line !== this.shownLine) {
      this.shownLine = line;
      this.radioText.setText(line ?? '').setVisible(line !== null);
      if (line !== null) playBeep(880, 80);
    }
  }

  drawMap() {
    const g = this.add.graphics().setDepth(0);
    for (let ty = 0; ty < this.map.rows; ty++) {
      for (let tx = 0; tx < this.map.cols; tx++) {
        g.fillStyle(this.map.grid[ty][tx] ? COLORS.wall : COLORS.floor, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    const { tx, ty } = this.map.exit;
    this.exitGfx = this.add.graphics().setDepth(1);
    this.exitGfx.fillStyle(COLORS.exit, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }
}
