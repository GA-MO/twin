import { fetchUser, type User } from "./users";
export function greet9(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature9: unknown user");
    done("feature9: hello " + user.name);
  });
}
