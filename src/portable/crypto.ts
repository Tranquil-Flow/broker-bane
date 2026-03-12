// src/portable/crypto.ts
// Web Crypto API only — no Node.js imports

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (salt.length < 32) throw new Error("Salt must be at least 32 bytes");
  if (salt.every((b) => b === 0)) throw new Error("Salt must not be all zeros");
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { iv, ciphertext };
}

export async function decrypt(key: CryptoKey, iv: Uint8Array, ciphertext: ArrayBuffer): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Decryption failed — wrong passphrase or corrupted data");
  }
}

export async function checksum(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
