import { fetchUser, type User } from "./users";
export function greet6(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature6: unknown user");
    done("feature6: hello " + user.name);
  });
}
