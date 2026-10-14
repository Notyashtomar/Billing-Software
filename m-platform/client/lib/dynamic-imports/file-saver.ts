import 'client-only';

export async function getFileSaverSaveAs(): Promise<
  (data: Blob | string, filename?: string, options?: unknown) => void
> {
  const mod = await import('file-saver');
  return (mod.saveAs || mod.default?.saveAs || mod.default) as unknown as (
    data: Blob | string,
    filename?: string,
    options?: unknown,
  ) => void;
}
