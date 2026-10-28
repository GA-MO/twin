export type User = { id: number; name: string };
const DB: Record<number, User> = { 1: { id: 1, name: "Ann" }, 2: { id: 2, name: "Bo" } };
export function fetchUser(id: number, cb: (err: Error | null, user?: User) => void): void {
  setTimeout(() => (DB[id] ? cb(null, DB[id]) : cb(new Error(`user ${id} not found`))), 1);
}
