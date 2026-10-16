export function parseUserAgent(userAgent?: string): {
  device: string;
  browser: string;
  os: string;
} {
  const ua = String(userAgent ?? '').trim();
  if (!ua) {
    return { device: 'Unknown', browser: 'Unknown', os: 'Unknown' };
  }

  let os = 'Unknown';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';

  let device = 'Desktop';
  if (/mobile/i.test(ua)) device = 'Mobile';
  else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

  return { device, browser, os };
}

export function extractClientIp(headers: Record<string, unknown>): string | undefined {
  const forwarded = String(headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = String(headers['x-real-ip'] ?? '').trim();
  if (realIp) return realIp;
  return undefined;
}
