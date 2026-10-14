import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const PREFIX = 'enc:';

function getVaultKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    'fris-secure-credential-vault-key-2026-production';
  return createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a plaintext password using AES-256-GCM for secure database vaulting.
 * Output format: `enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encryptPassword(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    return '';
  }
  const key = getVaultKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted password string.
 * Returns the plaintext password, or null if decryption fails or input is invalid.
 */
export function decryptPassword(ciphertext: string | undefined | null): string | null {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return null;
  }
  const trimmed = ciphertext.trim();
  if (!trimmed.startsWith(PREFIX)) {
    // If it's a legacy unencrypted string (and not a bcrypt hash), return as-is
    if (!trimmed.startsWith('$2') && !trimmed.startsWith('$argon2')) {
      return trimmed;
    }
    return null;
  }

  try {
    const parts = trimmed.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      return null;
    }
    const [ivHex, authTagHex, encHex] = parts;
    if (!ivHex || !authTagHex || !encHex) {
      return null;
    }

    const key = getVaultKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encBuffer = Buffer.from(encHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encBuffer),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Checks whether a given string is in the encrypted vault format.
 */
export function isEncryptedPassword(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().startsWith(PREFIX);
}
