'use client';

export async function loadFileSaverSaveAs(): Promise<
  (data: Blob | string, filename?: string, options?: unknown) => void
> {
  const mod = await import('file-saver');
  return (mod.saveAs || mod.default?.saveAs || mod.default) as unknown as (
    data: Blob | string,
    filename?: string,
    options?: unknown,
  ) => void;
}
