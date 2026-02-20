// utils/secureStorage.ts
import { encrypt, decrypt } from "./cryptoUtils";

/**
 * Securely save a value to localStorage with encryption
 * @param {string} key - The key to store the value under
 * @param {string} value - The value to encrypt and store
 * @returns {boolean} - Success status
 */
export function secureSet(key: string, value: string): boolean {
  if (!key || value === undefined || value === null) return false;

  try {
    const encryptedValue = encrypt(String(value));
    localStorage.setItem(key, encryptedValue);
    return true;
  } catch (error) {
    console.error(`Error securely saving to localStorage (${key}):`, error);
    return false;
  }
}

/**
 * Securely retrieve a value from localStorage with decryption
 * @param {string} key - The key to retrieve
 * @returns {string|null} - The decrypted value or null if not found/decryption fails
 */
export function secureGet(key: string): string | null {
  if (!key) return null;

  try {
    const encryptedValue = localStorage.getItem(key);

    if (!encryptedValue) return null;

    // Check if the value is encrypted (starts with our prefix)
    if (encryptedValue.startsWith("ENC:")) {
      return decrypt(encryptedValue);
    }

    // If it's not encrypted, return as is (for backwards compatibility)
    return encryptedValue;
  } catch (error) {
    console.error(
      `Error securely retrieving from localStorage (${key}):`,
      error
    );
    return null;
  }
}

/**
 * Remove a value from localStorage
 * @param {string} key - The key to remove
 * @returns {boolean} - Success status
 */
export function secureRemove(key: string): boolean {
  if (!key) return false;

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing from localStorage (${key}):`, error);
    return false;
  }
}

/**
 * Check if a key exists in localStorage
 * @param {string} key - The key to check
 * @returns {boolean} - True if the key exists
 */
export function secureHas(key: string): boolean {
  if (!key) return false;

  try {
    return localStorage.getItem(key) !== null;
  } catch (error) {
    console.error(`Error checking localStorage (${key}):`, error);
    return false;
  }
}
