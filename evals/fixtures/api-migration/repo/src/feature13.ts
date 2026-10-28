import { fetchUser, type User } from "./users";
export function greet13(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature13: unknown user");
    done("feature13: hello " + user.name);
  });
}
