type OtplibModule = {
  verify: (input: {
    secret: string;
    token: string;
  }) => Promise<{ valid?: boolean }>;
  generateSecret: () => string;
};

let otplibPromise: Promise<OtplibModule> | undefined;

async function loadOtplib(): Promise<OtplibModule> {
  if (!otplibPromise) {
    otplibPromise = import('otplib') as Promise<OtplibModule>;
  }
  return otplibPromise;
}

export async function verifyAdminTotp(
  secret: string,
  token: string,
): Promise<boolean> {
  const normalizedSecret = String(secret ?? '').trim();
  const normalizedToken = String(token ?? '').trim();
  if (!normalizedSecret || !/^\d{6}$/.test(normalizedToken)) {
    return false;
  }
  try {
    const { verify } = await loadOtplib();
    const result = await verify({
      secret: normalizedSecret,
      token: normalizedToken,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

export async function generateAdminMfaSecret(): Promise<string> {
  const { generateSecret } = await loadOtplib();
  return generateSecret();
}
