import { fetchUser, type User } from "./users";
export function greet4(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature4: unknown user");
    done("feature4: hello " + user.name);
  });
}
