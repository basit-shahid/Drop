/**
 * Chat Encryption Module - TweetNaCl.js-compatible encryption
 * Uses XSalsa20-Poly1305 AEAD cipher for message encryption
 */

class ChatEncryption {
    constructor() {
        this.keyPair = null;
        this.sharedSecrets = new Map(); // userId -> shared secret
    }

    /**
     * Generate random bytes
     */
    static generateRandomBytes(length) {
        const array = new Uint8Array(length);
        this.getCryptoProvider().getRandomValues(array);
        return array;
    }

    /**
     * Resolve a usable Web Crypto provider.
     * Browsers require secure context for subtle crypto (HTTPS/localhost).
     * Electron renderers can fallback to Node's webcrypto.
     */
    static getCryptoProvider() {
        if (globalThis.crypto && globalThis.crypto.subtle) {
            return globalThis.crypto;
        }

        try {
            if (typeof require !== 'undefined') {
                const nodeCrypto = require('crypto');
                if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
                    return nodeCrypto.webcrypto;
                }
            }
        } catch (e) {
            // Ignore and throw clear error below.
        }

        throw new Error('Web Crypto unavailable. Open chat via HTTPS or localhost.');
    }

    /**
     * Convert buffer to hex string
     */
    static bufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert hex string to buffer
     */
    static hexToBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * Encrypt message using AES-256-GCM
     */
    static async encryptMessage(message, key) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(message);
            
            // Generate random IV
            const iv = this.generateRandomBytes(12);
            
            // Accept either an existing CryptoKey or raw key bytes
            const cryptoKey = await this.normalizeAesKey(key, ['encrypt']);

            // Encrypt message
            const encryptedData = await cryptoProvider.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                cryptoKey,
                messageBytes
            );

            // Combine IV + encrypted data
            const combined = new Uint8Array(iv.length + encryptedData.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encryptedData), iv.length);

            return this.bufferToHex(combined);
        } catch (err) {
            console.error('Encryption failed:', err);
            throw new Error('Failed to encrypt message');
        }
    }

    /**
     * Decrypt message using AES-256-GCM
     */
    static async decryptMessage(encryptedHex, key) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const encryptedData = this.hexToBuffer(encryptedHex);
            
            // Extract IV (first 12 bytes)
            const iv = encryptedData.slice(0, 12);
            const ciphertext = encryptedData.slice(12);

            // Accept either an existing CryptoKey or raw key bytes
            const cryptoKey = await this.normalizeAesKey(key, ['decrypt']);

            // Decrypt message
            const decryptedData = await cryptoProvider.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                cryptoKey,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedData);
        } catch (err) {
            console.error('Decryption failed:', err);
            throw new Error('Failed to decrypt message');
        }
    }

    /**
     * Normalize key input to an AES-GCM CryptoKey.
     * Supports CryptoKey, ArrayBuffer, or Uint8Array.
     */
    static async normalizeAesKey(key, usages) {
        const cryptoProvider = this.getCryptoProvider();
        if (!key) {
            throw new Error('Encryption key is missing');
        }

        if (key instanceof CryptoKey) {
            return key;
        }

        const keyData = key instanceof Uint8Array ? key : new Uint8Array(key);
        return await cryptoProvider.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-GCM', length: 256 },
            false,
            usages
        );
    }

    /**
     * Generate encryption key from username/password
     */
    static async deriveKey(username, password) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const encoder = new TextEncoder();
            const salt = encoder.encode(username + 'drop-chat-salt');
            
            const keyMaterial = await cryptoProvider.subtle.importKey(
                'raw',
                encoder.encode(password),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await cryptoProvider.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            return key;
        } catch (err) {
            console.error('Key derivation failed:', err);
            throw new Error('Failed to derive encryption key');
        }
    }

    /**
     * Generate simple encryption key (for quick setup)
     */
    static generateEncryptionKey() {
        return this.generateRandomBytes(32); // 256-bit key
    }

    /**
     * Convert CryptoKey to exportable format
     */
    static async exportKey(key) {
        try {
            const exported = await this.getCryptoProvider().subtle.exportKey('raw', key);
            return this.bufferToHex(exported);
        } catch (err) {
            console.error('Failed to export key:', err);
            return null;
        }
    }

    /**
     * Import key from hex
     */
    static async importKey(keyHex) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const keyData = this.hexToBuffer(keyHex);
            return await cryptoProvider.subtle.importKey(
                'raw',
                keyData,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (err) {
            console.error('Failed to import key:', err);
            return null;
        }
    }

    /**
     * Create message hash for integrity verification
     */
    static async hashMessage(message) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const encoder = new TextEncoder();
            const data = encoder.encode(message);
            const hashBuffer = await cryptoProvider.subtle.digest('SHA-256', data);
            return this.bufferToHex(hashBuffer);
        } catch (err) {
            console.error('Hashing failed:', err);
            return null;
        }
    }

    /**
     * Create shared encryption key from username (for group chat)
     */
    static async createGroupKey(conversationId) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const encoder = new TextEncoder();
            const keyMaterial = await cryptoProvider.subtle.importKey(
                'raw',
                encoder.encode(conversationId + 'group-chat-key'),
                'PBKDF2',
                false,
                ['deriveBits']
            );

            const bits = await cryptoProvider.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode('drop-group-salt'),
                    iterations: 50000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                256
            );

            return await cryptoProvider.subtle.importKey(
                'raw',
                bits,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (err) {
            console.error('Group key creation failed:', err);
            return null;
        }
    }
}

// Export for use in Node.js and Browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatEncryption;
}
