// src/portable/serialize.ts
// No Node.js imports — Web Crypto API only
import type { PortablePayload, ExportEnvelope } from "./schema.js";
import { deriveKey, encrypt, checksum } from "./crypto.js";

export interface SerializeOptions {
  source: "cli" | "pwa" | "dashboard";
  appVersion: string;
  exclude?: Array<"email_log" | "pipeline_runs">;
}

export async function serialize(
  payload: PortablePayload,
  passphrase: string,
  options: SerializeOptions,
): Promise<string> {
  if (passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters");
  }

  // Apply exclusions
  const exported: PortablePayload = { ...payload };
  if (options.exclude?.includes("email_log")) exported.email_log = [];
  if (options.exclude?.includes("pipeline_runs")) exported.pipeline_runs = [];

  // Encrypt
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(passphrase, salt);
  const plaintext = JSON.stringify(exported);
  const { iv, ciphertext } = await encrypt(key, plaintext);
  const payloadBase64 = uint8ToBase64(new Uint8Array(ciphertext));
  const checksumHex = await checksum(ciphertext);

  const envelope: ExportEnvelope = {
    format: "brokerbane-export",
    version: 1,
    app_version: options.appVersion,
    created_at: new Date().toISOString(),
    source: options.source,
    crypto: {
      algorithm: "AES-256-GCM",
      kdf: "PBKDF2",
      iterations: 200_000,
      hash: "SHA-256",
      salt: uint8ToBase64(salt),
      iv: uint8ToBase64(iv),
      checksum: checksumHex,
    },
    summary: {
      removal_requests: exported.removal_requests.length,
      broker_responses: exported.broker_responses.length,
      email_log: exported.email_log.length,
      evidence_chain: exported.evidence_chain.length,
      pending_tasks: exported.pending_tasks.length,
      scan_runs: exported.scan_runs.length,
      scan_results: exported.scan_results.length,
      pipeline_runs: exported.pipeline_runs.length,
    },
    payload: payloadBase64,
  };

  return JSON.stringify(envelope, null, 2);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
