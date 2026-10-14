'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import ReactCrop, {
  convertToPixelCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCroppedImageFileFromElement } from '@/lib/crop-image';
import { cn } from '@/lib/utils';

type ImageCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  title?: string;
  description?: string;
  fileName?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File) => void;
  onCancel?: () => void;
};

const INITIAL_CROP: Crop = {
  unit: '%',
  x: 8,
  y: 8,
  width: 84,
  height: 84,
};

export function ImageCropDialog({
  open,
  imageSrc,
  title = 'Crop image',
  description = 'Drag the corners to resize the crop area, or drag inside to reposition.',
  fileName = 'cropped-image.jpg',
  onOpenChange,
  onConfirm,
  onCancel,
}: ImageCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (open && imageSrc) {
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  }, [open, imageSrc]);

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = event.currentTarget;
    setCrop(INITIAL_CROP);
    setCompletedCrop(convertToPixelCrop(INITIAL_CROP, width, height));
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  const resolvePixelCrop = (): PixelCrop | null => {
    const image = imgRef.current;
    if (!image) return null;

    if (completedCrop?.width && completedCrop?.height) {
      return completedCrop;
    }

    if (!crop?.width || !crop?.height) return null;
    const pixelCrop = convertToPixelCrop(crop, image.width, image.height);
    if (!pixelCrop.width || !pixelCrop.height) return null;
    return pixelCrop;
  };

  const handleConfirm = async () => {
    const image = imgRef.current;
    const pixelCrop = resolvePixelCrop();
    if (!image || !pixelCrop) return;

    setProcessing(true);
    try {
      const file = await getCroppedImageFileFromElement(
        image,
        pixelCrop,
        fileName,
      );
      onConfirm(file);
      onOpenChange(false);
      setCrop(undefined);
      setCompletedCrop(undefined);
    } finally {
      setProcessing(false);
    }
  };

  const canConfirm = Boolean(resolvePixelCrop());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleCancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[min(92dvh,100%)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-slate-600">{description}</DialogDescription>
          <p className="text-xs font-medium text-emerald-700">Free crop — resize to any shape</p>
        </DialogHeader>

        <div className="relative min-h-[12rem] max-h-[min(42dvh,22rem)] flex-1 overflow-auto bg-slate-950 p-3">
          {imageSrc && clientReady ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
              className={cn('mx-auto max-h-[min(38dvh,20rem)]')}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop preview"
                onLoad={handleImageLoad}
                className="mx-auto block max-h-[min(38dvh,20rem)] w-auto max-w-full"
              />
            </ReactCrop>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
          <DialogFooter className="flex flex-row flex-wrap justify-end gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={processing}
              className="min-w-[6.5rem] border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!imageSrc || !canConfirm || processing}
              className="min-w-[9.5rem] bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Use cropped image
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
