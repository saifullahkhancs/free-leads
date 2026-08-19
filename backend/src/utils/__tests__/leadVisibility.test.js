const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasFullLeadAccess,
  getPrivilegedLeadVisibility,
} = require("../leadVisibility");

for (const role of ["super_admin", "admin"]) {
  test(`${role} receives unrestricted lead contact visibility`, () => {
    const user = { id: `${role}-id`, roles: [role] };

    assert.equal(hasFullLeadAccess(user), true);
    assert.deepStrictEqual(getPrivilegedLeadVisibility(user), {
      show_email: true,
      show_phone: true,
      show_linkedin: true,
      show_twitter: true,
      show_website: true,
      show_about: true,
      can_view_contact: true,
      is_paid: true,
      has_full_access: true,
    });
  });
}

test("regular users do not receive the privileged visibility override", () => {
  const user = { id: "member-id", roles: ["user"] };
  assert.equal(hasFullLeadAccess(user), false);
  assert.equal(getPrivilegedLeadVisibility(user), null);
});
