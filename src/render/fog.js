import { VIEW_W, VIEW_H, FOG_ALPHA } from '../config.js';

const KEY = 'fog-overlay';

/**
 * Screen-sized darkness layer. Each frame it is filled with black, then the visibility
 * polygon is cut out with destination-out so only the lit wedge shows the world.
 */
export class FogOverlay {
  constructor(scene) {
    if (scene.textures.exists(KEY)) scene.textures.remove(KEY);
    this.texture = scene.textures.createCanvas(KEY, VIEW_W, VIEW_H);
    this.image = scene.add.image(0, 0, KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(1000);
  }

  /** polygon is in world pixels; camera scroll converts it to screen pixels. */
  draw(polygon, camera, fullBlack) {
    const ctx = this.texture.getContext();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = `rgba(0,0,0,${fullBlack ? 1 : FOG_ALPHA})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!fullBlack && polygon.length > 2) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      ctx.beginPath();
      polygon.forEach((p, i) => {
        const x = p.x - camera.scrollX;
        const y = p.y - camera.scrollY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    this.texture.refresh();
  }
}
