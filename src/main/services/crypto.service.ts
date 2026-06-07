import * as crypto from 'crypto';
import { ramStore } from './ramStore.service';

/**
 * Crypto Service - Handles AES-GCM-256 and RSA encryption
 *
 * Flow:
 * 1. Student enters ID → verified with server
 * 2. Generate AES-GCM-256 key + sessionID
 * 3. Get RSA public key from server
 * 4. Encrypt RegisterPayload with RSA → send to server
 * 5. For subsequent requests: encrypt token with AES → attach as x-user-token header
 */
class CryptoService {
  private static instance: CryptoService;
  private constructor() {}

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  // ─── Key Generation ───────────────────────────────────────────

  /** Generate a 256-bit AES key as hex string (64 chars) */
  public generateAesKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** Generate a random session ID (8 character hex string) */
  public generateSessionId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  /** Generate a random string (8 character hex string) for token */
  public generateRandomString(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // ─── AES-GCM-256 Encryption ──────────────────────────────────

  /**
   * Encrypt data with AES-GCM-256 (Base64 encoded)
   */
  public encryptAesPayload(plaintext: string, aesKeyHex: string, device_uuid: string) {
    const key = Buffer.from(aesKeyHex, 'hex');
    const iv = crypto.randomBytes(12); // GCM standard 12 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      ciphertext: encrypted,
      tag: authTag.toString('base64'),
      device_uuid,
    };
  }

  /** Decrypt AES-GCM-256 data (Base64 encoded) */
  public decryptAesPayload(payload: { iv: string; tag: string; ciphertext: string }, aesKeyHex: string): string {
    const key = Buffer.from(aesKeyHex, 'hex');
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.tag, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ─── RSA Encryption ──────────────────────────────────────────

  /** Encrypt data with RSA public key */
  public encryptRsa(data: string, publicKeyPem: string): string {
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(data, 'utf8')
    );
    return encrypted.toString('base64');
  }

  // ─── Token Generation ────────────────────────────────────────

  public createTokenPayload(deviceUuid: string) {
    const cryptoState = ramStore.cryptoState;
    if (!cryptoState) {
      throw new Error('Crypto state not initialized. Register first.');
    }

    const payload = {
      timestamp: Date.now(),
      nonce: this.generateRandomString(), // Use random string as nonce
      session_token: cryptoState.userSessionID // Storing session token here to be encrypted
    };

    return this.encryptAesPayload(JSON.stringify(payload), cryptoState.aesKeyHex, deviceUuid);
  }

  // ─── Registration ────────────────────────────────────────────

  public buildRegistrationPayload(rsaPublicKey: string, deviceUuid: string) {
    const aesKey = this.generateAesKey();
    
    // Save crypto state to RAM temporarily. Session token will be updated upon login.
    ramStore.cryptoState = {
      aesKeyHex: aesKey,
      userSessionID: '', // to be populated
      rsaPublicKey
    };

    const aesKeyBuffer = Buffer.from(aesKey, 'hex');
    const encryptedAesKey = crypto.publicEncrypt(
      {
        key: rsaPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      aesKeyBuffer
    ).toString('base64');

    return {
      device_uuid: deviceUuid,
      encrypted_aes_key: encryptedAesKey
    };
  }
}

export const cryptoService = CryptoService.getInstance();
