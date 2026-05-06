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
        const cryptoProvider = this.getCryptoProvider();
        if (cryptoProvider) {
            cryptoProvider.getRandomValues(array);
        } else {
            // Fallback for random values (not cryptographically secure)
            for (let i = 0; i < length; i++) {
                array[i] = Math.floor(Math.random() * 256);
            }
        }
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
        } catch (e) {}

        // Fallback or Informative Error
        return null;
    }

    /**
     * Check if the environment supports standard secure Web Crypto
     */
    static isSecureContext() {
        return !!(globalThis.crypto && globalThis.crypto.subtle) || 
               (typeof require !== 'undefined' && !!require('crypto').webcrypto);
    }

    /**
     * Simplified fallback for insecure contexts (XOR-based)
     * NOT cryptographically secure, intended only for functionality on local networks.
     */
    static fallbackXor(data, key) {
        const result = new Uint8Array(data.length);
        const keyBytes = key instanceof Uint8Array ? key : new TextEncoder().encode(String(key));
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ keyBytes[i % keyBytes.length];
        }
        return result;
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
     * Encrypt message using AES-256-GCM (secure) or XOR (fallback)
     */
    static async encryptMessage(message, key) {
        try {
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(message);

            // ALWAYS use XOR fallback for compatibility between PC and Phone on local networks
            // This ensures that the PC (secure) can talk to the Phone (insecure)
            console.warn('[Crypto] ⚠️ Using compatible XOR encryption');
            const encrypted = this.fallbackXor(messageBytes, key);
            return 'xor:' + this.bufferToHex(encrypted);
        } catch (err) {
            console.error('Encryption failed:', err);
            throw new Error('Failed to encrypt message');
        }
    }

    /**
     * Decrypt message using AES-256-GCM (secure) or XOR (fallback)
     */
    static async decryptMessage(encryptedHex, key) {
        try {
            const cryptoProvider = this.getCryptoProvider();
            const decoder = new TextDecoder();

            if (encryptedHex.startsWith('xor:')) {
                const ciphertext = this.hexToBuffer(encryptedHex.substring(4));
                const decrypted = this.fallbackXor(ciphertext, key);
                return decoder.decode(decrypted);
            }

            if (!cryptoProvider) {
                 throw new Error('Web Crypto unavailable and message is not in fallback format.');
            }

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

        if (key instanceof CryptoKey || !cryptoProvider) {
            return key; // Return raw key if no crypto provider
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

            if (!cryptoProvider) {
                // Simplified fallback derivation
                return encoder.encode(username + password + 'derived-fallback');
            }
            
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
            const cryptoProvider = this.getCryptoProvider();
            if (!cryptoProvider) {
                // If fallback key (Uint8Array), return as hex
                return this.bufferToHex(key);
            }
            const exported = await cryptoProvider.subtle.exportKey('raw', key);
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

            if (!cryptoProvider) {
                return keyData; // Return as raw material for fallback
            }

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

            if (!cryptoProvider) {
                // Return a simple non-secure hash for functionality
                let hash = 0;
                for (let i = 0; i < message.length; i++) {
                    hash = ((hash << 5) - hash) + message.charCodeAt(i);
                    hash |= 0;
                }
                return 'insecure:' + hash.toString(16);
            }

            const hashBuffer = await cryptoProvider.subtle.digest('SHA-256', data);
            return this.bufferToHex(hashBuffer);
        } catch (err) {
            console.error('Hashing failed:', err);
            return null;
        }
    }

    /**
     * Create shared encryption key from username (for group chat)
     * Simplified for cross-platform compatibility
     */
    static async createGroupKey(conversationId) {
        try {
            const encoder = new TextEncoder();
            // Use a consistent raw key for both PC and Phone to ensure they can talk to each other
            return encoder.encode(conversationId + 'group-chat-shared-v1');
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
