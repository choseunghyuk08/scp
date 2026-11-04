import { TILE, VIEW_W, VIEW_H, PLAYER, KEY_PICKUP_DIST, EXIT_INTERACT_DIST, ZONE_COUNT, TRANSITION_MS, R_CONFIRM_MS } from '../config.js';
import { playBeep } from '../audio/beep.js';
import { createBlink, isBlinking, stepBlink } from '../logic/blink.js';
import { createDoublePress } from '../logic/confirm.js';
import { tileCenter, tileOf } from '../logic/grid.js';
import { parseMap } from '../logic/map.js';
import { buildZone } from '../logic/mapgen.js';
import { moveWithCollision } from '../logic/movement.js';
import { createRadio } from '../logic/radio.js';
import { activationFor, advanceZone, createRun, registerDeath, zoneSpec } from '../logic/run.js';
import { create173, isLethal, step173 } from '../logic/scp173.js';
import { createStamina, canRun, stepStamina } from '../logic/stamina.js';
import { clampDt } from '../logic/time.js';
import { canSee, visibilityPolygon } from '../logic/vision.js';
import { FogOverlay } from '../render/fog.js';
import { bootRun, clearRun, getStorage, saveRun } from '../save.js';
import { debugEnabled, installDebug } from '../debug.js';

const COLORS = {
  floor: 0x3a3a46,
  wall: 0x6a6a7c,
  exit: 0x8a2a2a,
  gate: 0x2a8a5a,
  player: 0xe8e8e8,
  scp173: 0xd8d0a8,
  key: 0xf0d040,
};
const FONT = '"Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
let generationCounter = 0;
const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/** ?seed= starts a run once; dropping it from the address bar makes a refresh resume that run's checkpoint. */
function consumeSeedParam() {
  const url = new URL(location.href);
  if (!url.searchParams.has('seed')) return;
  url.searchParams.delete('seed');
  history.replaceState(history.state, '', url);
}

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  /**
   * data.rows (+ data.activation): legacy fixed map, no run and no saving (v0.1 smoke rooms).
   * data.run: zone mode for that run. Neither: boot a run from ?seed= or the saved checkpoint.
   */
  create(data) {
    this.generation = ++generationCounter;
    this.storage = getStorage();
    if (data?.rows) {
      this.run = null;
      this.spec = null;
      this.zoneInfo = null;
      this.map = parseMap(data.rows);
      this.activation = data.activation ?? { kind: 'always' };
    } else {
      this.run = data?.run ?? bootRun({ search: location.search, storage: this.storage, randomSeed });
      if (!data?.run) consumeSeedParam();
      this.spec = zoneSpec(this.run.seed, this.run.zone);
      const { map, info } = buildZone(this.run.seed, this.spec, this.run.attempt);
      this.map = map;
      this.zoneInfo = info;
      this.activation = activationFor(this.spec);
      saveRun(this.run, this.storage); // checkpoint: entering a zone
    }
    this.grid = this.map.grid.map((row) => [...row]);
    this.player = { ...this.map.playerStart };
    this.facing = 0;
    this.pointerMoved = false;
    this.aimOverride = null;
    this.stamina = createStamina();
    this.blink = createBlink();
    this.scp = this.map.spawns173.map(create173);
    this.observed = this.scp.map(() => false);
    this.hasKey = this.run ? this.run.hasKey : false;
    // Every zone but the last ends in a gate to the next zone. The card-key zone's gate stays locked until the key is
    // picked up, so nobody reaches the final locked exit without it. The last zone keeps the card-key exit.
    this.gateOpen = Boolean(this.spec && !this.spec.isFinal && (!this.spec.hasKey || this.hasKey));
    if (this.gateOpen) this.grid[this.map.exit.ty][this.map.exit.tx] = false;
    this.radio = createRadio(this.run ? this.run.heard : []);
    this.shownLine = null;
    this.mode = 'playing';
    this.rPress = createDoublePress(R_CONFIRM_MS);
    this.debugView = false;

    this.drawMap();
    this.keyGfx = this.add.graphics().setDepth(4);
    if (this.map.cardKey && !this.hasKey) {
      this.keyGfx.fillStyle(COLORS.key, 1).fillRect(this.map.cardKey.x - 3, this.map.cardKey.y - 3, 6, 6);
    }
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
      if (this.mode === 'dead') this.restartAfterDeath();
      else if (this.mode === 'escaped') this.startNewRun();
    });
    this.input.keyboard.on('keydown-E', () => this.tryInteract());
    this.input.keyboard.on('keydown-R', (event) => {
      if (!event.repeat) this.onNewRunKey(); // a held key auto-repeats; only a real second press confirms
    });
    if (debugEnabled()) this.input.keyboard.on('keydown-M', () => this.toggleDebugView());
    // Phaser releases held keys itself when the window loses focus; the smoke check "blur releases keys" guards that.

    this.radio.fire('start', this.nowMs());
    installDebug(this);
    if (data?.fadeIn) this.cameras.main.fadeIn(TRANSITION_MS);
    this.render();
  }

  /** Same zone, next attempt (a fresh layout), keeping what was carried in when the zone was entered. */
  restartAfterDeath() {
    if (!this.run) {
      this.scene.restart();
      return;
    }
    const run = registerDeath(this.run, this.radio.heardEvents());
    saveRun(run, this.storage);
    this.scene.restart({ run });
  }

  startNewRun() {
    if (!this.run) {
      this.scene.restart();
      return;
    }
    clearRun(this.storage);
    const run = createRun(randomSeed());
    saveRun(run, this.storage);
    this.scene.restart({ run });
  }

  /** R twice within R_CONFIRM_MS throws the run away; a single press only shows the warning. */
  onNewRunKey() {
    if (!this.run || this.mode === 'transition') return;
    if (this.rPress.press(this.nowMs()) === 'confirmed') {
      this.startNewRun();
      return;
    }
    this.rText.setVisible(true);
    this.time.delayedCall(R_CONFIRM_MS + 50, () => this.rText.setVisible(this.rPress.isArmed(this.nowMs())));
  }

  /** Debug only: fog off, every 173 drawn, and the seed/zone/attempt in the corner. */
  toggleDebugView() {
    this.debugView = !this.debugView;
    this.fog.image.setVisible(!this.debugView);
    this.debugText.setText(this.debugLabel()).setVisible(this.debugView);
    this.render();
  }

  debugLabel() {
    if (!this.run) return '고정 맵';
    const fallback = this.zoneInfo.usedFallback ? ' · 폴백' : '';
    return `시드 ${this.run.seed} · 구역 ${this.run.zone + 1}/${ZONE_COUNT} · 시도 ${this.run.attempt}${fallback}`;
  }

  beginTransition() {
    this.mode = 'transition';
    const run = advanceZone({ ...this.run, hasKey: this.hasKey, heard: this.radio.heardEvents() });
    saveRun(run, this.storage); // saved now, so a reload during the fade already resumes in the next zone
    this.cameras.main.fadeOut(TRANSITION_MS, 0, 0, 0);
    this.time.delayedCall(TRANSITION_MS, () => this.scene.restart({ run, fadeIn: true }));
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
      step173(s, { dt, grid: this.grid, player: this.player, observed: this.observed[i], activation: this.activation }),
    );

    const now = this.nowMs();
    if (this.observed.some(Boolean)) this.radio.fire('seen173', now);
    if (this.blink.gauge >= 0.8) this.radio.fire('blinkWarning', now);
    const key = this.map.cardKey;
    if (key && !this.hasKey && Math.hypot(this.player.x - key.x, this.player.y - key.y) <= KEY_PICKUP_DIST) {
      this.pickUpKey();
    }
    if (this.scp.some((s) => isLethal(s, this.player))) this.die();
    const { exit } = this.map;
    if (this.mode === 'playing' && this.gateOpen && tileOf(this.player.x) === exit.tx && tileOf(this.player.y) === exit.ty) {
      this.beginTransition();
    }

    this.render();
  }

  pickUpKey() {
    this.hasKey = true;
    this.keyGfx.clear();
    if (this.spec && !this.spec.isFinal && !this.gateOpen) this.openGate();
    this.radio.fire('gotKey', this.nowMs());
    playBeep(1320, 150);
  }

  openGate() {
    const { tx, ty } = this.map.exit;
    this.gateOpen = true;
    this.grid[ty][tx] = false;
    this.exitGfx.clear().fillStyle(COLORS.gate, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }

  tryInteract() {
    if (this.mode !== 'playing' || this.gateOpen) return;
    const door = tileCenter(this.map.exit.tx, this.map.exit.ty);
    if (Math.hypot(door.x - this.player.x, door.y - this.player.y) > EXIT_INTERACT_DIST) return;
    if (!this.hasKey) {
      this.radio.fire('noKey', this.nowMs());
      return;
    }
    if (this.spec && !this.spec.isFinal) return; // zone gates are walked through, never opened with E
    const { tx, ty } = this.map.exit;
    this.grid[ty][tx] = false;
    this.exitGfx.clear().fillStyle(COLORS.floor, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
    this.mode = 'escaped';
    playBeep(660, 300);
    this.showBanner('탈출 성공 — v0.1 끝. Space로 다시', '#80ff80');
  }

  die() {
    this.mode = 'dead';
    this.scpGfx.setDepth(1002); // reveal the killer above the fog
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

    // 173 is drawn only while the player is actually looking at it, or once it has killed them.
    this.scpGfx.clear();
    this.scp.forEach((s, i) => {
      if (this.observed[i] || this.mode === 'dead' || this.debugView) this.scpGfx.fillStyle(COLORS.scp173, 1).fillRect(s.pos.x - 5, s.pos.y - 5, 10, 10);
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
    this.zoneLabel = this.run ? `구역 ${this.run.zone + 1}/${ZONE_COUNT}` : null;
    if (this.zoneLabel) {
      this.add
        .text(8, 8, this.zoneLabel, { fontFamily: FONT, fontSize: '10px', color: '#c0c0d0' })
        .setScrollFactor(0)
        .setDepth(2001);
    }
    this.rText = this.add
      .text(VIEW_W / 2, VIEW_H - 40, 'R을 한 번 더 누르면 새 판 (진행 삭제)', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffb040',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2002)
      .setVisible(false);
    this.debugText = this.add
      .text(8, 22, '', { fontFamily: FONT, fontSize: '10px', color: '#80e0ff', backgroundColor: '#000000' })
      .setScrollFactor(0)
      .setDepth(2002)
      .setVisible(false);
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
    this.exitGfx.fillStyle(this.gateOpen ? COLORS.gate : COLORS.exit, 1).fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }
}
