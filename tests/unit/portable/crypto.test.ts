import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, checksum } from "../../../src/portable/crypto.js";

describe("portable crypto", () => {
  it("round-trips encrypt/decrypt with correct passphrase", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key = await deriveKey("test-passphrase", salt);
    const plaintext = '{"profile":{"first_name":"Jane"}}';
    const { iv, ciphertext } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong passphrase", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key1 = await deriveKey("correct", salt);
    const key2 = await deriveKey("wrong", salt);
    const { iv, ciphertext } = await encrypt(key1, "secret");
    await expect(decrypt(key2, iv, ciphertext)).rejects.toThrow("Decryption failed — wrong passphrase or corrupted data");
  });

  it("rejects salt shorter than 32 bytes", async () => {
    const shortSalt = new Uint8Array(16);
    await expect(deriveKey("pass", shortSalt)).rejects.toThrow("Salt must be at least 32 bytes");
  });

  it("rejects all-zero salt", async () => {
    const zeroSalt = new Uint8Array(32); // all zeros by default
    await expect(deriveKey("pass", zeroSalt)).rejects.toThrow("Salt must not be all zeros");
  });

  it("computes deterministic SHA-256 checksum", async () => {
    const data = new TextEncoder().encode("hello world").buffer as ArrayBuffer;
    const hash1 = await checksum(data);
    const hash2 = await checksum(data);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encrypts/decrypts empty string correctly", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key = await deriveKey("test-passphrase", salt);
    const plaintext = "";
    const { iv, ciphertext } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("round-trips large payload (>1MB)", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key = await deriveKey("test-passphrase", salt);
    // Create a 2MB string
    const plaintext = "x".repeat(2 * 1024 * 1024);
    const { iv, ciphertext } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, iv, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("checksum of different data produces different hashes", async () => {
    const data1 = new TextEncoder().encode("hello world").buffer as ArrayBuffer;
    const data2 = new TextEncoder().encode("hello world!").buffer as ArrayBuffer;
    const hash1 = await checksum(data1);
    const hash2 = await checksum(data2);
    expect(hash1).not.toBe(hash2);
  });
});
