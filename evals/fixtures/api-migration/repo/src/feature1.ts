import { fetchUser, type User } from "./users";
export function greet1(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature1: unknown user");
    done("feature1: hello " + user.name);
  });
}
