require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/User");

async function seedAdmin() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be configured in server/.env.");
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to the account email or the new administrator email.");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
    const existingUser = await User.findOne({ email }).select("+authTokenVersion");
    if (existingUser) {
      if (existingUser.deletedAt) {
        throw new Error("That account has been deleted. Use a different email address.");
      }
      if (existingUser.isSuspended) {
        throw new Error("That account is suspended. Restore it before granting admin access.");
      }
      if (existingUser.role !== "admin") {
        existingUser.role = "admin";
        existingUser.authTokenVersion = (existingUser.authTokenVersion || 0) + 1;
        await existingUser.save();
      }
      console.info(`${existingUser.email} now has the admin role. Sign in again at /admin/login.`);
      return;
    }

    const name = process.env.ADMIN_NAME?.trim();
    const mobile = process.env.ADMIN_MOBILE?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (
      !name ||
      name.length > 100 ||
      !/^\d{10}$/.test(mobile || "") ||
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new Error(
        "No account exists for ADMIN_EMAIL. To create one, also set ADMIN_NAME, ADMIN_MOBILE (10 digits), and ADMIN_PASSWORD (8-72 bytes).",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      mobile,
      passwordHash,
      role: "admin",
    });
    console.info(`Administrator account ${user.email} created. Sign in at /admin/login.`);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

seedAdmin().catch((error) => {
  console.error("Could not grant admin access:", error.message);
  process.exitCode = 1;
});
