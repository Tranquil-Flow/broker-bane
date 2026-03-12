// src/portable/deserialize.ts
// No Node.js imports — Web Crypto API only
import { ExportEnvelopeSchema, PortablePayloadSchema } from "./schema.js";
import type { ExportEnvelope, PortablePayload } from "./schema.js";
import { deriveKey, decrypt, checksum } from "./crypto.js";
import { migrate } from "./migrate.js";

const CURRENT_VERSION = 1;

export function readEnvelope(fileContent: string): ExportEnvelope {
  const raw = JSON.parse(fileContent);
  return ExportEnvelopeSchema.parse(raw);
}

export async function deserialize(fileContent: string, passphrase: string): Promise<PortablePayload> {
  const envelope = readEnvelope(fileContent);

  // Verify checksum before attempting decryption
  const ciphertextBytes = base64ToUint8(envelope.payload);
  const computedChecksum = await checksum(ciphertextBytes.buffer as ArrayBuffer);
  if (computedChecksum !== envelope.crypto.checksum) {
    throw new Error("Checksum mismatch — file is corrupted or tampered");
  }

  // Decrypt
  const salt = base64ToUint8(envelope.crypto.salt);
  const iv = base64ToUint8(envelope.crypto.iv);
  const key = await deriveKey(passphrase, salt);
  const plaintext = await decrypt(key, iv, ciphertextBytes.buffer as ArrayBuffer);

  // Parse, migrate if needed, validate
  const raw = JSON.parse(plaintext);
  const migrated = envelope.version < CURRENT_VERSION ? migrate(raw, envelope.version) : raw;

  return PortablePayloadSchema.parse(migrated);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
