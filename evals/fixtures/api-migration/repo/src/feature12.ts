import { fetchUser, type User } from "./users";
export function greet12(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature12: unknown user");
    done("feature12: hello " + user.name);
  });
}
