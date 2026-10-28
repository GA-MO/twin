import { fetchUser, type User } from "./users";
export function greet3(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature3: unknown user");
    done("feature3: hello " + user.name);
  });
}
