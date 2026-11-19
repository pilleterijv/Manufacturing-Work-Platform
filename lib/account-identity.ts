import { z } from "zod";
const part = z.string().trim().min(1).max(75);
// Full-name fallback keeps existing integrations/accounts compatible. New forms send both parts.
export function accountIdentity(input: {
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
}) {
  if (input.firstName !== undefined || input.lastName !== undefined) {
    const firstName = part.parse(input.firstName),
      lastName = part.parse(input.lastName);
    return { firstName, lastName, name: `${firstName} ${lastName}` };
  }
  const name = z.string().trim().min(1).max(150).parse(input.name);
  const [firstName, ...rest] = name.split(/\s+/);
  return { name, firstName, lastName: rest.join(" ") };
}
