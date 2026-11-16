const crypto = require("crypto");

function generateRegistrationOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashRegistrationOtp(email, otp) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required to protect email verification codes.");
  }
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");
}

function matchesRegistrationOtp(email, otp, storedHash) {
  if (typeof storedHash !== "string" || !/^[a-f\d]{64}$/i.test(storedHash)) {
    return false;
  }
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashRegistrationOtp(email, otp), "hex");
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  generateRegistrationOtp,
  hashRegistrationOtp,
  matchesRegistrationOtp,
};
