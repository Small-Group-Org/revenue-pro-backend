import CryptoJS from "crypto-js";
import { config } from "../../../config.js";

/**
 * Encrypts a string using AES encryption
 * @param text - The text to encrypt
 * @returns Encrypted string
 */
export function encrypt(text: string): string {
  if (!config.CONFIG_SECRET_KEY) {
    throw new Error("CONFIG_SECRET_KEY is not configured");
  }
  return CryptoJS.AES.encrypt(text, config.CONFIG_SECRET_KEY).toString();
}

/**
 * Decrypts an encrypted string
 * @param encryptedText - The encrypted text to decrypt
 * @returns Decrypted string
 */
export function decrypt(encryptedText: string): string {
  if (!config.CONFIG_SECRET_KEY) {
    throw new Error("CONFIG_SECRET_KEY is not configured");
  }
  const bytes = CryptoJS.AES.decrypt(encryptedText, config.CONFIG_SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

