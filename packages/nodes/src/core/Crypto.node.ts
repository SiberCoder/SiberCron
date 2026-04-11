import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { createHash, createHmac, randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Crypto node — cryptographic operations using Node.js built-in crypto.
 *
 * Operations:
 *  - hash:    MD5 / SHA-1 / SHA-256 / SHA-512 of a field value
 *  - hmac:    HMAC-SHA256 with a secret key
 *  - base64:  Encode / decode Base64
 *  - random:  Generate random bytes / UUID / integer
 *  - encrypt: AES-256-GCM encrypt (returns { iv, tag, encrypted } as base64)
 *  - decrypt: AES-256-GCM decrypt
 */
export const CryptoNode: INodeType = {
  definition: {
    displayName: 'Crypto',
    name: 'sibercron.crypto',
    icon: 'Lock',
    color: '#6366F1',
    group: 'core',
    version: 1,
    description: 'Hash, HMAC, Base64, random, AES-256 encrypt/decrypt',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'hash',
        required: true,
        options: [
          { name: 'Hash (MD5 / SHA-1 / SHA-256 / SHA-512)', value: 'hash' },
          { name: 'HMAC-SHA256', value: 'hmac' },
          { name: 'Base64 Encode', value: 'base64Encode' },
          { name: 'Base64 Decode', value: 'base64Decode' },
          { name: 'Random — UUID / bytes / integer', value: 'random' },
          { name: 'AES-256-GCM Encrypt', value: 'encrypt' },
          { name: 'AES-256-GCM Decrypt', value: 'decrypt' },
        ],
      },
      // Hash options
      {
        name: 'algorithm',
        displayName: 'Algorithm',
        type: 'select',
        default: 'sha256',
        options: [
          { name: 'MD5', value: 'md5' },
          { name: 'SHA-1', value: 'sha1' },
          { name: 'SHA-256', value: 'sha256' },
          { name: 'SHA-512', value: 'sha512' },
        ],
        displayOptions: { show: { operation: ['hash'] } },
      },
      {
        name: 'encoding',
        displayName: 'Output Encoding',
        type: 'select',
        default: 'hex',
        options: [
          { name: 'Hex', value: 'hex' },
          { name: 'Base64', value: 'base64' },
        ],
        displayOptions: { show: { operation: ['hash', 'hmac'] } },
      },
      // Common input field
      {
        name: 'field',
        displayName: 'Input Field',
        type: 'string',
        default: 'data',
        description: 'Field containing the value to process',
        placeholder: 'data',
        displayOptions: {
          show: { operation: ['hash', 'hmac', 'base64Encode', 'base64Decode', 'encrypt', 'decrypt'] },
        },
      },
      // HMAC / Encrypt / Decrypt key
      {
        name: 'secret',
        displayName: 'Secret / Key',
        type: 'string',
        default: '',
        description: 'Secret key for HMAC or AES-256 (exactly 32 characters / 256 bits for AES)',
        placeholder: 'mysecret',
        displayOptions: { show: { operation: ['hmac', 'encrypt', 'decrypt'] } },
      },
      // Decrypt — needs IV and auth tag
      {
        name: 'ivField',
        displayName: 'IV Field',
        type: 'string',
        default: 'iv',
        description: 'Field containing the base64-encoded IV',
        displayOptions: { show: { operation: ['decrypt'] } },
      },
      {
        name: 'tagField',
        displayName: 'Auth Tag Field',
        type: 'string',
        default: 'tag',
        description: 'Field containing the base64-encoded GCM auth tag',
        displayOptions: { show: { operation: ['decrypt'] } },
      },
      // Random options
      {
        name: 'randomType',
        displayName: 'Random Type',
        type: 'select',
        default: 'uuid',
        options: [
          { name: 'UUID v4', value: 'uuid' },
          { name: 'Hex bytes', value: 'hex' },
          { name: 'Integer (0 – max)', value: 'integer' },
        ],
        displayOptions: { show: { operation: ['random'] } },
      },
      {
        name: 'byteLength',
        displayName: 'Byte Length',
        type: 'number',
        default: 16,
        description: 'Number of random bytes (for hex output)',
        displayOptions: { show: { operation: ['random'] } },
      },
      {
        name: 'maxInteger',
        displayName: 'Max Integer (exclusive)',
        type: 'number',
        default: 1000000,
        displayOptions: { show: { operation: ['random'] } },
      },
      // Output field
      {
        name: 'outputField',
        displayName: 'Output Field',
        type: 'string',
        default: 'result',
        description: 'Field to write the result into',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = context.getParameter<string>('operation') ?? 'hash';
    const field = context.getParameter<string>('field') ?? 'data';
    const outputField = context.getParameter<string>('outputField') ?? 'result';

    return items.map((item) => {
      try {
        let result: unknown;

        switch (operation) {
          case 'hash': {
            const algo = context.getParameter<string>('algorithm') ?? 'sha256';
            const enc = context.getParameter<string>('encoding') ?? 'hex';
            const val = String(item.json[field] ?? '');
            result = createHash(algo).update(val).digest(enc as 'hex' | 'base64');
            break;
          }
          case 'hmac': {
            const secret = context.getParameter<string>('secret') ?? '';
            const enc = context.getParameter<string>('encoding') ?? 'hex';
            const val = String(item.json[field] ?? '');
            result = createHmac('sha256', secret).update(val).digest(enc as 'hex' | 'base64');
            break;
          }
          case 'base64Encode': {
            const val = String(item.json[field] ?? '');
            result = Buffer.from(val, 'utf8').toString('base64');
            break;
          }
          case 'base64Decode': {
            const val = String(item.json[field] ?? '');
            result = Buffer.from(val, 'base64').toString('utf8');
            break;
          }
          case 'random': {
            const randomType = context.getParameter<string>('randomType') ?? 'uuid';
            if (randomType === 'uuid') {
              result = randomUUID();
            } else if (randomType === 'hex') {
              const byteLen = Math.max(1, Math.min(context.getParameter<number>('byteLength') ?? 16, 512));
              result = randomBytes(byteLen).toString('hex');
            } else {
              const max = Math.max(1, context.getParameter<number>('maxInteger') ?? 1000000);
              // Use randomBytes for cryptographically secure integer generation
              const buf = randomBytes(4);
              result = buf.readUInt32BE(0) % max;
            }
            break;
          }
          case 'encrypt': {
            const secret = context.getParameter<string>('secret') ?? '';
            if (secret.length !== 32) throw new Error('AES-256 key must be exactly 32 characters');
            const val = String(item.json[field] ?? '');
            const iv = randomBytes(12); // 96-bit IV for GCM
            const cipher = createCipheriv('aes-256-gcm', secret, iv);
            const encrypted = Buffer.concat([cipher.update(val, 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            result = {
              encrypted: encrypted.toString('base64'),
              iv: iv.toString('base64'),
              tag: tag.toString('base64'),
            };
            break;
          }
          case 'decrypt': {
            const secret = context.getParameter<string>('secret') ?? '';
            if (secret.length !== 32) throw new Error('AES-256 key must be exactly 32 characters');
            const ivField = context.getParameter<string>('ivField') ?? 'iv';
            const tagField = context.getParameter<string>('tagField') ?? 'tag';
            const encryptedB64 = String(item.json[field] ?? '');
            const ivB64 = String(item.json[ivField] ?? '');
            const tagB64 = String(item.json[tagField] ?? '');
            const decipher = createDecipheriv(
              'aes-256-gcm',
              secret,
              Buffer.from(ivB64, 'base64'),
            );
            decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
            const decrypted = Buffer.concat([
              decipher.update(Buffer.from(encryptedB64, 'base64')),
              decipher.final(),
            ]);
            result = decrypted.toString('utf8');
            break;
          }
          default:
            result = null;
        }

        return { json: { ...item.json, [outputField]: result } };
      } catch (err) {
        return { json: { ...item.json, [outputField]: null, _cryptoError: (err as Error).message } };
      }
    });
  },
};
