import { fetchUser, type User } from "./users";
export function greet5(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature5: unknown user");
    done("feature5: hello " + user.name);
  });
}
