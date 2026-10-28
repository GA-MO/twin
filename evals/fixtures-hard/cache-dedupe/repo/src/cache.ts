type Entry<T> = { value: T; at: number };
const store = new Map<string, Entry<unknown>>();
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now = Date.now): Promise<T> {
  const hit = store.get(key);
  if (hit && now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, { value, at: now() });
  return value;
}
export const clearCache = () => store.clear();
