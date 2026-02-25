import * as crypto from 'crypto';
import { ramStore } from './ramStore.service';
import type { RegisterUserCryptoPayload, UserAccessTokenPayload } from '../../common/types';

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
   * Encrypt data with AES-GCM-256
   * Output format: iv:authTag:encryptedHex
   */
  public encryptAes(plaintext: string, aesKeyHex: string): string {
    const key = Buffer.from(aesKeyHex, 'hex');
    const iv = crypto.randomBytes(12); // GCM standard 12 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /** Decrypt AES-GCM-256 data (format: iv:authTag:encryptedHex) */
  public decryptAes(encryptedToken: string, aesKeyHex: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedToken.split(':');
    const key = Buffer.from(aesKeyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
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

  /**
   * Create an encrypted access token for authenticated API requests.
   * Uses the AES key stored in RAM store.
   */
  public createToken(): string {
    const cryptoState = ramStore.cryptoState;
    if (!cryptoState) {
      throw new Error('Crypto state not initialized. Register first.');
    }

    const studentInfo = ramStore.studentInfo;
    const payload: UserAccessTokenPayload = {
      studentID: studentInfo.id,
      timestamp: Date.now(),
      userSessionID: cryptoState.userSessionID,
      randomString: this.generateRandomString()
    };

    return this.encryptAes(JSON.stringify(payload), cryptoState.aesKeyHex);
  }

  // ─── Registration ────────────────────────────────────────────

  /**
   * Build the encrypted registration payload.
   * Encrypts with RSA public key for server registration.
   */
  public buildRegistrationPayload(rsaPublicKey: string): string {
    const aesKey = this.generateAesKey();
    const sessionId = this.generateSessionId();
    const ipAddress = ramStore.getLocalIpAddress();
    const studentInfo = ramStore.studentInfo;

    // Save crypto state to RAM
    ramStore.cryptoState = {
      aesKeyHex: aesKey,
      userSessionID: sessionId,
      rsaPublicKey
    };

    const payload: RegisterUserCryptoPayload = {
      studentID: studentInfo.id,
      aesKey,
      userSessionID: sessionId,
      ipAddress
    };

    return this.encryptRsa(JSON.stringify(payload), rsaPublicKey);
  }

  /**
   * Initialize crypto: generate keys and register with server.
   * Returns the encrypted payload ready to send to POST /auth/register.
   */
  public initializeCrypto(rsaPublicKey: string): { encryptedPayload: string } {
    const encryptedPayload = this.buildRegistrationPayload(rsaPublicKey);
    return { encryptedPayload };
  }
}

export const cryptoService = CryptoService.getInstance();
