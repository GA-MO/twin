import { fetchUser, type User } from "./users";
export function greet7(id: number, done: (text: string) => void): void {
  fetchUser(id, (err, user?: User) => {
    if (err || !user) return done("feature7: unknown user");
    done("feature7: hello " + user.name);
  });
}
