const assert = require("node:assert/strict");
const test = require("node:test");
const {
  generateRegistrationOtp,
  hashRegistrationOtp,
  matchesRegistrationOtp,
} = require("../src/utils/registrationOtp");

const previousJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "test-secret-for-registration-otp";

test("registration OTPs are six-digit numeric codes", () => {
  for (let index = 0; index < 20; index += 1) {
    assert.match(generateRegistrationOtp(), /^\d{6}$/);
  }
});

test("registration OTP hashes are bound to their email and code", () => {
  const hash = hashRegistrationOtp("asha@example.com", "042681");

  assert.notEqual(hash, "042681");
  assert.equal(matchesRegistrationOtp("asha@example.com", "042681", hash), true);
  assert.equal(matchesRegistrationOtp("asha@example.com", "042682", hash), false);
  assert.equal(matchesRegistrationOtp("other@example.com", "042681", hash), false);
  assert.equal(matchesRegistrationOtp("asha@example.com", "042681", "invalid"), false);
});

test.after(() => {
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});
