import { fetchUser, type User } from "./users";
export function greet11(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature11: unknown user");
    done("feature11: hello " + user.name);
  });
}
