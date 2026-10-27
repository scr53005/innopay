import { describe, expect, it } from 'vitest';
import { cropLayout } from './logo-crop';

describe('cropLayout', () => {
  it('covers a square crop with a landscape image and clamps vertical dragging', () => {
    const layout = cropLayout(400, 200, 1, { x: 999, y: 20 });
    expect(layout.width).toBe(512);
    expect(layout.height).toBe(256);
    expect(layout.offset).toEqual({ x: 128, y: 0 });
    expect(layout.drawX).toBe(0);
  });

  it('allows both axes when zoomed and clamps at the image edge', () => {
    const layout = cropLayout(200, 200, 2, { x: -200, y: 50 });
    expect(layout.offset).toEqual({ x: -128, y: 50 });
    expect(layout.drawX).toBe(-256);
    expect(layout.drawY).toBe(-78);
  });
});
