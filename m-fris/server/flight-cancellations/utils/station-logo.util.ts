import * as fs from 'fs';
import * as path from 'path';

/** CID referenced in cancellation email HTML (`cid:bird-station-logo`). */
export const CANCELLATION_EMAIL_LOGO_CID = 'bird-station-logo';

/** CID for airline logo in header pill (`cid:airline-logo`). */
export const CANCELLATION_EMAIL_AIRLINE_LOGO_CID = 'airline-logo';

const DEFAULT_STATION_LOGO_FILES = ['BAS.png', 'BFS.png', 'GSEC.png'];

const CITY_TO_LOGO_FILE: Record<string, string> = {
  delhi: 'BFS.png',
  kochi: 'BFS.png',
  agra: 'BFS.png',
  noida: 'BFS.png',
  juhu: 'BFS.png',
  trichy: 'BAS.png',
  coimbatore: 'BAS.png',
  imphal: 'BAS.png',
  agartala: 'BAS.png',
  goa: 'BAS.png',
  chandigarh: 'BAS.png',
  chennai: 'BAS.png',
  trivandrum: 'GSEC.png',
  thiruvananthapuram: 'GSEC.png',
};

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveStationLogoFileForCity(
  city?: string | null,
): string | null {
  const key = normalizeCity(String(city ?? ''));
  if (!key) return null;
  return CITY_TO_LOGO_FILE[key] ?? null;
}

/** Common IATA codes → city names for route display in emails. */
const AIRPORT_CITY_NAMES: Record<string, string> = {
  DMK: 'Don Mueang',
  MAA: 'Chennai',
  DEL: 'Delhi',
  BOM: 'Mumbai',
  BLR: 'Bengaluru',
  HYD: 'Hyderabad',
  GOI: 'Goa',
  CCU: 'Kolkata',
  COK: 'Kochi',
  TRV: 'Thiruvananthapuram',
  AMD: 'Ahmedabad',
  PNQ: 'Pune',
  IXC: 'Chandigarh',
  GAU: 'Guwahati',
  BAH: 'Bahrain',
  AUH: 'Abu Dhabi',
};

export function airportCityName(code: string): string {
  const c = String(code ?? '')
    .trim()
    .toUpperCase();
  return AIRPORT_CITY_NAMES[c] ?? '';
}

export type CancellationEmailLogoAttachment = {
  filename: string;
  path?: string;
  content?: Buffer;
  cid: string;
  contentDisposition?: 'inline';
  contentType?: string;
};

/** Logo asset for HTML + nodemailer inline attachment (avoids blocked data: URIs). */
export type CancellationEmailLogoAsset = {
  imgSrc: string;
  attachment?: CancellationEmailLogoAttachment;
};

function publicRoots(): string[] {
  return [
    path.join(process.cwd(), 'client', 'public'),
    path.join(process.cwd(), '..', 'client', 'public'),
  ];
}

function mimeForFile(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function parseDataImageUri(
  dataUri: string,
): { mime: string; buffer: Buffer } | null {
  const m = /^data:(image\/[^;]+);base64,([\s\S]+)$/i.exec(dataUri.trim());
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

function cidLogoAsset(
  attachment: CancellationEmailLogoAttachment,
  cid: string,
): CancellationEmailLogoAsset {
  return {
    imgSrc: `cid:${cid}`,
    attachment: {
      ...attachment,
      cid,
      contentDisposition: 'inline',
    },
  };
}

/** Inline email asset from data URI or https (unique CID per image). */
export function resolveEmailAssetFromSrc(
  raw: string | null | undefined,
  cid: string,
  filenameBase: string,
): CancellationEmailLogoAsset | null {
  const src = String(raw ?? '').trim();
  if (!src) return null;

  if (src.startsWith('https://') || src.startsWith('http://')) {
    return { imgSrc: src };
  }

  if (src.startsWith('data:image/')) {
    const parsed = parseDataImageUri(src);
    if (!parsed) return null;
    const ext = parsed.mime.includes('jpeg') ? 'jpg' : 'png';
    return cidLogoAsset(
      {
        filename: `${filenameBase}.${ext}`,
        content: parsed.buffer,
        cid,
        contentType: parsed.mime,
      },
      cid,
    );
  }

  return null;
}

function findLocalLogoFile(city?: string | null): { root: string; fileName: string } | null {
  const envFile = String(process.env.STATION_LOGO_FILE ?? '').trim();
  const cityFile = resolveStationLogoFileForCity(city);
  const candidates = [
    ...(envFile ? [envFile] : []),
    ...(cityFile ? [cityFile] : []),
    ...DEFAULT_STATION_LOGO_FILES.filter(
      (fileName) => fileName !== envFile && fileName !== cityFile,
    ),
  ];

  for (const root of publicRoots()) {
    for (const fileName of candidates) {
      if (fs.existsSync(path.join(root, fileName))) {
        return { root, fileName };
      }
    }
  }
  return null;
}

/**
 * Resolve logo for cancellation emails.
 * Uses CID inline attachments for local/data logos so clients do not block data: URIs.
 */
export function resolveStationLogoEmailAsset(
  incomingSrc?: string | null,
  stationCity?: string | null,
): CancellationEmailLogoAsset | null {
  const fromUrl = String(process.env.STATION_LOGO_URL ?? '').trim();
  const raw = String(incomingSrc ?? '').trim() || fromUrl;

  const fromSrc = resolveEmailAssetFromSrc(
    raw,
    CANCELLATION_EMAIL_LOGO_CID,
    'station-logo',
  );
  if (fromSrc) return fromSrc;

  const found = findLocalLogoFile(stationCity);
  if (!found) return null;

  return cidLogoAsset(
    {
      filename: found.fileName,
      path: path.join(found.root, found.fileName),
      cid: CANCELLATION_EMAIL_LOGO_CID,
      contentType: mimeForFile(found.fileName),
    },
    CANCELLATION_EMAIL_LOGO_CID,
  );
}

/** Airline logo from `advance-airline-logo` collection (CID inline attachment). */
export function resolveAirlineLogoEmailAsset(
  logoDataUrl: string | null | undefined,
): CancellationEmailLogoAsset | null {
  return resolveEmailAssetFromSrc(
    logoDataUrl,
    CANCELLATION_EMAIL_AIRLINE_LOGO_CID,
    'airline-logo',
  );
}

/**
 * @deprecated Prefer {@link resolveStationLogoEmailAsset} for email sends.
 * Returns data URI for non-email callers only.
 */
export function resolveStationLogoSrc(): string | null {
  const asset = resolveStationLogoEmailAsset();
  if (!asset) return null;
  if (asset.imgSrc.startsWith('cid:')) {
    const att = asset.attachment;
    if (att?.content) {
      const mime = att.contentType ?? 'image/png';
      return `data:${mime};base64,${att.content.toString('base64')}`;
    }
    if (att?.path && fs.existsSync(att.path)) {
      const buf = fs.readFileSync(att.path);
      const mime = att.contentType ?? mimeForFile(att.filename);
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
  }
  return asset.imgSrc;
}
