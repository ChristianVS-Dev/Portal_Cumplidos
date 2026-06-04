/** Convierte BigInt/Dates de MySQL a tipos serializables en JSON */
export function toJsonSafe(value) {
  if (value == null) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)])
    );
  }
  return value;
}
