import { fetchUser, type User } from "./users";
export function greet10(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature10: unknown user");
    done("feature10: hello " + user.name);
  });
}
