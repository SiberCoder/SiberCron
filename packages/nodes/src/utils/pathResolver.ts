/**
 * Dot-notation path resolver: "user.address.city" → value
 * Shared utility for all nodes that need nested field access
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set nested value by dot-notation path
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  if (!path) return;
  const parts = path.split('.');
  const lastPart = parts.pop()!;
  let current: unknown = obj;
  for (const part of parts) {
    if (!(part in (current as Record<string, unknown>))) {
      (current as Record<string, unknown>)[part] = {};
    }
    current = (current as Record<string, unknown>)[part];
  }
  (current as Record<string, unknown>)[lastPart] = value;
}
