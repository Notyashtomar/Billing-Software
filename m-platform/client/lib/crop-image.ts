import { cropToCanvas, type PixelCrop } from 'react-image-crop';

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not create image blob'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function resolveOutputMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function buildCroppedFileName(fileName: string, mimeType: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'image';
  if (mimeType === 'image/png') return `${baseName}.png`;
  if (mimeType === 'image/webp') return `${baseName}.webp`;
  return `${baseName}.jpg`;
}

export async function getCroppedImageFileFromElement(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  fileName: string,
): Promise<File> {
  const mimeType = resolveOutputMimeType(fileName);
  const canvas = document.createElement('canvas');
  await cropToCanvas(image, canvas, pixelCrop);
  const blob = await canvasToBlob(canvas, mimeType);
  return new File([blob], buildCroppedFileName(fileName, mimeType), {
    type: mimeType,
    lastModified: Date.now(),
  });
}
