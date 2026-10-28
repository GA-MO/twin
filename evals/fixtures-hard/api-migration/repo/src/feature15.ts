import { fetchUser, type User } from "./users";
export function greet15(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature15: unknown user");
    done("feature15: hello " + user.name);
  });
}
