export function serializeDates<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(serializeDates) as unknown as T;
  }
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = v instanceof Date ? v.toISOString() : serializeDates(v);
    }
    return result as T;
  }
  if (obj instanceof Date) {
    return obj.toISOString() as unknown as T;
  }
  return obj;
}
