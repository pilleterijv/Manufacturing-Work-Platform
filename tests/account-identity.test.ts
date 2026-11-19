import { test } from "node:test";
import assert from "node:assert/strict";
import { accountIdentity } from "../lib/account-identity";
test("structured account names preserve compound names and derive the searchable display name", () => {
  assert.deepEqual(
    accountIdentity({
      firstName: " Mary Ann ",
      lastName: " van der Meer ",
      name: "incorrect",
    }),
    {
      firstName: "Mary Ann",
      lastName: "van der Meer",
      name: "Mary Ann van der Meer",
    }
  );
  assert.throws(() => accountIdentity({ firstName: "Mary", lastName: " " }));
  assert.throws(() => accountIdentity({ firstName: "Mary" }));
});
test("legacy identities remain readable without fabricating a missing surname", () => {
  assert.deepEqual(accountIdentity({ name: "Existing Person" }), {
    name: "Existing Person",
    firstName: "Existing",
    lastName: "Person",
  });
  assert.equal(accountIdentity({ name: "Admin" }).lastName, "");
});
