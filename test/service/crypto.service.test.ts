import { describe, it, expect, beforeEach } from 'vitest';
import { cryptoService } from '../../src/main/services/crypto.service';
import { ramStore } from '../../src/main/services/ramStore.service';
import * as crypto from 'crypto';

describe('CryptoService', () => {
  beforeEach(() => {
    ramStore.clear();
  });

  it('should generate AES key and Session ID properly', () => {
    const key = cryptoService.generateAesKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBe(64); // 32 bytes hex = 64 chars

    const sessionId = cryptoService.generateSessionId();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBe(8); // 4 bytes hex = 8 chars
  });

  it('should encrypt and decrypt AES payload correctly', () => {
    const aesKey = cryptoService.generateAesKey();
    const plaintext = JSON.stringify({ hello: 'world' });
    const deviceUuid = 'test-uuid';

    const encrypted = cryptoService.encryptAesPayload(plaintext, aesKey, deviceUuid);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    expect(encrypted.device_uuid).toBe(deviceUuid);

    const decrypted = cryptoService.decryptAesPayload(encrypted, aesKey);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt data with RSA properly', () => {
    // Generate an RSA key pair for testing
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const plaintext = 'test-rsa-message';
    const encrypted = cryptoService.encryptRsa(plaintext, publicKey);

    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(encrypted, 'base64')
    );

    expect(decrypted.toString('utf8')).toBe(plaintext);
  });

  it('should build registration payload and update ramStore correctly', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const deviceUuid = 'test-device-uuid';
    const payload = cryptoService.buildRegistrationPayload(publicKey, deviceUuid);

    expect(payload.device_uuid).toBe(deviceUuid);
    expect(payload.encrypted_aes_key).toBeDefined();

    // Verify ramStore state
    expect(ramStore.cryptoState).toBeDefined();
    expect(ramStore.cryptoState?.rsaPublicKey).toBe(publicKey);
    expect(ramStore.cryptoState?.aesKeyHex).toBeDefined();
    
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.from(payload.encrypted_aes_key, 'base64')
    ).toString('hex');
    
    expect(decryptedAesKey).toBe(ramStore.cryptoState?.aesKeyHex);
  });

  it('should create token payload using saved crypto state', () => {
    expect(() => cryptoService.createTokenPayload('test')).toThrow('Crypto state not initialized');

    ramStore.cryptoState = {
      aesKeyHex: cryptoService.generateAesKey(),
      rsaPublicKey: 'fake-pub-key',
      userSessionID: 'mock-session-id'
    };

    const payloadStr = cryptoService.createTokenPayload('uuid-1');
    expect(payloadStr.device_uuid).toBe('uuid-1');
    expect(payloadStr.ciphertext).toBeDefined();

    // Verify decryption reveals the structure
    const decryptedJson = cryptoService.decryptAesPayload(payloadStr, ramStore.cryptoState.aesKeyHex);
    const decryptedObj = JSON.parse(decryptedJson);
    
    expect(decryptedObj.session_token).toBe('mock-session-id');
    expect(decryptedObj.timestamp).toBeDefined();
    expect(decryptedObj.nonce).toBeDefined();
  });
});
