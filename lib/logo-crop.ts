export const LOGO_CROP_SIZE = 256;

export interface CropOffset { x: number; y: number }

export function cropLayout(imageWidth: number, imageHeight: number, zoom: number, offset: CropOffset) {
  if (imageWidth <= 0 || imageHeight <= 0 || zoom < 1) throw new Error('Invalid crop dimensions');
  const scale = Math.max(LOGO_CROP_SIZE / imageWidth, LOGO_CROP_SIZE / imageHeight) * zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const limitX = (width - LOGO_CROP_SIZE) / 2;
  const limitY = (height - LOGO_CROP_SIZE) / 2;
  const x = Math.max(-limitX, Math.min(limitX, offset.x));
  const y = Math.max(-limitY, Math.min(limitY, offset.y));
  return {
    width,
    height,
    offset: { x, y },
    drawX: (LOGO_CROP_SIZE - width) / 2 + x,
    drawY: (LOGO_CROP_SIZE - height) / 2 + y,
  };
}
