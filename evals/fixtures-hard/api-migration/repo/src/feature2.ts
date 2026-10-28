import { fetchUser, type User } from "./users";
export function greet2(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature2: unknown user");
    done("feature2: hello " + user.name);
  });
}
