/**
 * Generic input normalization utilities
 * Reusable across all modules for consistent data handling
 */

/**
 * Normalizes an email address for consistent storage and lookups
 * - Trims whitespace
 * - Converts to lowercase
 * - Prevents duplicate records from case variations (user@example.com vs User@Example.COM)
 *
 * @param email - The email address to normalize
 * @returns The normalized email (trimmed and lowercase)
 *
 * @example
 * normalizeEmail('  User@Example.COM  ') // Returns: 'user@example.com'
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalizes a username for consistent storage and lookups
 * - Trims whitespace
 * - Converts to lowercase
 *
 * @param username - The username to normalize
 * @returns The normalized username (trimmed and lowercase)
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Normalizes a phone number by removing common formatting characters
 * - Removes spaces, dashes, parentheses, and plus signs
 * - Keeps only digits
 *
 * @param phone - The phone number to normalize
 * @returns The normalized phone number (digits only)
 *
 * @example
 * normalizePhone('+1 (555) 123-4567') // Returns: '15551234567'
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, '');
}

/**
 * Normalizes whitespace in a string
 * - Trims leading/trailing whitespace
 * - Collapses multiple spaces to single space
 *
 * @param text - The text to normalize
 * @returns The normalized text
 *
 * @example
 * normalizeWhitespace('  Hello    World  ') // Returns: 'Hello World'
 */
export function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
