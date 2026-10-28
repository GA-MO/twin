import { fetchUser, type User } from "./users";
export function greet14(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature14: unknown user");
    done("feature14: hello " + user.name);
  });
}
