'use client';

import { useEffect, useRef, useState } from 'react';
import { cropLayout, LOGO_CROP_SIZE, type CropOffset } from '@/lib/logo-crop';

const MAX_SOURCE_BYTES = 20_000_000;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export default function LogoCropper({ onCropped, onSourceSelected }: {
  onCropped: (file: File | null) => void;
  onSourceSelected?: (selected: boolean) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [selectedSource, setSelectedSource] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; offset: CropOffset } | null>(null);
  const revisionRef = useRef(0);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, LOGO_CROP_SIZE, LOGO_CROP_SIZE);
    if (!image) return;
    const layout = cropLayout(image.naturalWidth, image.naturalHeight, zoom, offset);
    context.save();
    context.beginPath();
    context.arc(LOGO_CROP_SIZE / 2, LOGO_CROP_SIZE / 2, LOGO_CROP_SIZE / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, layout.drawX, layout.drawY, layout.width, layout.height);
    context.restore();
  }, [image, zoom, offset]);

  function chooseFile(file: File | null) {
    revisionRef.current++;
    onCropped(null);
    onSourceSelected?.(!!file);
    setSelectedSource(!!file);
    setReady(false);
    setError(null);
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    if (!file) return;
    // Some phone file pickers omit MIME type; the browser decoder still has to
    // recognize the image, and only the canvas-generated PNG is uploaded.
    if ((file.type && !ACCEPTED_TYPES.has(file.type)) || file.size > MAX_SOURCE_BYTES) {
      setError('Choose a PNG, JPEG or WebP source image under 20 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const nextImage = new Image();
    nextImage.onload = () => {
      if (objectUrlRef.current !== url) return;
      if (!nextImage.naturalWidth || !nextImage.naturalHeight) {
        setError('This image cannot be cropped.');
        return;
      }
      setImage(nextImage);
    };
    nextImage.onerror = () => {
      if (objectUrlRef.current === url) setError('This image cannot be opened.');
    };
    nextImage.src = url;
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!image || !dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const factor = LOGO_CROP_SIZE / rect.width;
    const proposed = {
      x: dragRef.current.offset.x + (event.clientX - dragRef.current.x) * factor,
      y: dragRef.current.offset.y + (event.clientY - dragRef.current.y) * factor,
    };
    setOffset(cropLayout(image.naturalWidth, image.naturalHeight, zoom, proposed).offset);
    revisionRef.current++;
    setReady(false);
    onCropped(null);
  }

  function changeZoom(value: number) {
    if (!image) return;
    setZoom(value);
    setOffset(cropLayout(image.naturalWidth, image.naturalHeight, value, offset).offset);
    revisionRef.current++;
    setReady(false);
    onCropped(null);
  }

  function applyCrop() {
    if (!image || !canvasRef.current) return;
    const revision = revisionRef.current;
    canvasRef.current.toBlob((blob) => {
      if (revision !== revisionRef.current) return;
      if (!blob || blob.size > 1_000_000) {
        setError('Could not produce a logo under 1 MB.');
        return;
      }
      onCropped(new File([blob], 'vendor-logo.png', { type: 'image/png' }));
      setReady(true);
      setError(null);
    }, 'image/png');
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Choose a photo or logo
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
          chooseFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = '';
        }}
          className="mt-1 block w-full text-sm" />
      </label>
      {selectedSource && <button type="button" onClick={() => chooseFile(null)}
        className="text-xs text-stone-600 underline">Clear selection</button>}
      {image && (
        <>
          <p className="text-xs text-stone-600">Drag the image inside the circle, then adjust the zoom.</p>
          <div className="mx-auto h-56 w-56 overflow-hidden rounded-full border-4 border-amber-500 bg-white">
            <canvas ref={canvasRef} width={LOGO_CROP_SIZE} height={LOGO_CROP_SIZE}
              aria-label="Circular logo crop preview"
              onPointerDown={(event) => {
                dragRef.current = { x: event.clientX, y: event.clientY, offset };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={() => { dragRef.current = null; }}
              onPointerCancel={() => { dragRef.current = null; }}
              className="block h-full w-full cursor-grab touch-none rounded-full active:cursor-grabbing" />
          </div>
          <label className="flex items-center gap-3 text-sm">
            Zoom
            <input type="range" min="1" max="3" step="0.01" value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))} className="min-w-0 flex-1" />
          </label>
          <button type="button" onClick={applyCrop} className="rounded-lg border px-3 py-2 text-sm font-semibold">
            Use this circular crop
          </button>
          {ready && <span className="ml-2 text-sm text-emerald-700">Crop ready to save</span>}
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
