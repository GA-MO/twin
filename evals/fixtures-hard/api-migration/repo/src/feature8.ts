import { fetchUser, type User } from "./users";
export function greet8(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature8: unknown user");
    done("feature8: hello " + user.name);
  });
}
