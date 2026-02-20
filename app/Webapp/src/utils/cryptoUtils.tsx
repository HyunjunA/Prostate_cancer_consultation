/**
 * Simple encryption utility for client-side data
 * Note: This is not secure against determined attackers with access to client code,
 * but provides basic obfuscation to prevent casual viewing of sensitive data
 */

// A unique salt to make encryption more secure
const ENCRYPTION_SALT: string = "beta-app-v1";

/**
 * Encrypt a string
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted text
 */
export function encrypt(text: string): string {
  if (!text) return "";

  try {
    // Create a simple encryption by encoding to base64 with a custom twist
    // For better security in a production app, consider using the Web Crypto API
    const encoded = btoa(unescape(encodeURIComponent(ENCRYPTION_SALT + text)));

    // Add some additional obfuscation by reversing the string and adding a prefix
    return "ENC:" + encoded.split("").reverse().join("");
  } catch (error) {
    console.error("Encryption failed:", error);
    return "";
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - The encrypted text
 * @returns {string} - The decrypted text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.startsWith("ENC:")) return "";

  try {
    // Remove the prefix and reverse the string
    const encoded = encryptedText.substring(4).split("").reverse().join("");

    // Decode from base64
    const decoded = decodeURIComponent(escape(atob(encoded)));

    // Remove the salt
    if (decoded.startsWith(ENCRYPTION_SALT)) {
      return decoded.substring(ENCRYPTION_SALT.length);
    }

    return "";
  } catch (error) {
    console.error("Decryption failed:", error);
    return "";
  }
}
