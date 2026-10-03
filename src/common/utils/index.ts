/**
 * Shared utility helpers.
 */

/**
 * Exclude specific keys from an object (useful for stripping passwords from user objects).
 */
export function exclude<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const clone = { ...obj };
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}
