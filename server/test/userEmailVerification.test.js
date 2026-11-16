const assert = require("node:assert/strict");
const test = require("node:test");
const User = require("../src/models/User");

const baseUser = {
  name: "Asha Sharma",
  email: "asha@example.com",
  mobile: "9876543210",
  passwordHash: "bcrypt-hash",
};

test("new citizen accounts require an email verification timestamp", async () => {
  const unverifiedUser = new User(baseUser);
  await assert.rejects(unverifiedUser.validate(), /emailVerifiedAt/);

  const verifiedUser = new User({
    ...baseUser,
    emailVerifiedAt: new Date(),
  });
  await assert.doesNotReject(verifiedUser.validate());
});

test("administrator accounts do not require citizen email verification", async () => {
  const administrator = new User({ ...baseUser, role: "admin" });
  await assert.doesNotReject(administrator.validate());
});
