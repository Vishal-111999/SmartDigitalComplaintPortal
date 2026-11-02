const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendEmail } = require("../utils/email");

// const cookieOptions = {
//   httpOnly: true,
//   sameSite: "lax",
//   secure: process.env.NODE_ENV === "production",
//   maxAge: 7 * 24 * 60 * 60 * 1000,
// };

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function userResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    address: user.address,
    role: user.role,
  };
}

function setSessionCookie(response, user) {
  const token = jwt.sign(
    { role: user.role, tokenVersion: user.authTokenVersion || 0 },
    process.env.JWT_SECRET,
    { subject: user._id.toString(), expiresIn: "7d" },
  );
  response.cookie("token", token, cookieOptions);
}

function sendPasswordResetEmail(user, resetUrl) {
  return sendEmail({
    to: user.email,
    subject: "Reset your Complaint Portal password",
    text: `Hello ${user.name},\n\nUse this link to reset your password within 30 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  });
}

async function register(request, response, next) {
  try {
    if (
      !request.body ||
      typeof request.body !== "object" ||
      Array.isArray(request.body)
    ) {
      return response
        .status(400)
        .json({ message: "Enter valid registration details." });
    }
    const { name, email, mobile, address = "", password } = request.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof mobile !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      !/^\S+@\S+\.\S+$/.test(email.trim()) ||
      email.trim().length > 254 ||
      !/^\d{10}$/.test(mobile) ||
      typeof address !== "string" ||
      address.trim().length > 500 ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return response.status(400).json({
        message:
          "Check your details. Use a valid email, a 10-digit mobile number, and a password between 8 and 72 bytes.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail }).select(
      "_id",
    );
    if (existingUser) {
      return response
        .status(409)
        .json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      mobile,
      address: address.trim(),
      passwordHash,
    });

    setSessionCookie(response, user);
    response.status(201).json({ user: userResponse(user) });
  } catch (error) {
    if (error.code === 11000) {
      return response
        .status(409)
        .json({ message: "An account with this email already exists." });
    }
    if (error.name === "ValidationError") {
      return response
        .status(400)
        .json({ message: "Check your account details and try again." });
    }
    next(error);
  }
}

async function login(request, response, next) {
  try {
    if (
      !request.body ||
      typeof request.body !== "object" ||
      Array.isArray(request.body)
    ) {
      return response
        .status(400)
        .json({ message: "Enter your email and password." });
    }
    const { email, password } = request.body;
    if (typeof email !== "string" || typeof password !== "string") {
      return response
        .status(400)
        .json({ message: "Enter your email and password." });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      role: "citizen",
      deletedAt: null,
    }).select("+passwordHash +authTokenVersion");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response
        .status(401)
        .json({ message: "Email or password is incorrect." });
    }
    if (user.isSuspended) {
      return response
        .status(403)
        .json({
          message: "This account is suspended. Contact support for assistance.",
        });
    }

    setSessionCookie(response, user);
    response.json({ user: userResponse(user) });
  } catch (error) {
    next(error);
  }
}

async function adminLogin(request, response, next) {
  try {
    if (
      !request.body ||
      typeof request.body !== "object" ||
      Array.isArray(request.body)
    ) {
      return response
        .status(400)
        .json({ message: "Enter your administrator email and password." });
    }
    const { email, password } = request.body;
    if (typeof email !== "string" || typeof password !== "string") {
      return response
        .status(400)
        .json({ message: "Enter your administrator email and password." });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
      role: "admin",
      deletedAt: null,
    }).select("+passwordHash +authTokenVersion");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response
        .status(401)
        .json({ message: "Administrator email or password is incorrect." });
    }
    if (user.isSuspended) {
      return response
        .status(403)
        .json({ message: "This administrator account is suspended." });
    }

    setSessionCookie(response, user);
    response.json({ user: userResponse(user) });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(request, response, next) {
  try {
    const { name, mobile, address } = request.body || {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof mobile !== "string" ||
      !/^\d{10}$/.test(mobile) ||
      (address !== undefined &&
        (typeof address !== "string" || address.trim().length > 500))
    ) {
      return response
        .status(400)
        .json({
          message:
            "Enter a valid name, 10-digit mobile number, and address up to 500 characters.",
        });
    }
    const user = await User.findByIdAndUpdate(
      request.user.id,
      { $set: { name: name.trim(), mobile, address: (address || "").trim() } },
      { returnDocument: "after", runValidators: true },
    );
    if (!user)
      return response.status(404).json({ message: "Account not found." });
    response.json({ user: userResponse(user) });
  } catch (error) {
    next(error);
  }
}

async function changePassword(request, response, next) {
  try {
    const { currentPassword, newPassword } = request.body || {};
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      Buffer.byteLength(newPassword, "utf8") > 72
    ) {
      return response
        .status(400)
        .json({
          message:
            "Enter your current password and a new password between 8 and 72 bytes.",
        });
    }
    const user = await User.findById(request.user.id).select(
      "+passwordHash +authTokenVersion",
    );
    if (!user)
      return response.status(404).json({ message: "Account not found." });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return response
        .status(401)
        .json({ message: "Your current password is incorrect." });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.authTokenVersion += 1;
    await user.save();
    setSessionCookie(response, user);
    response.json({
      message:
        "Your password has been changed. Other sessions have been signed out.",
    });
  } catch (error) {
    next(error);
  }
}

async function requestPasswordReset(request, response, next) {
  try {
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    ) {
      return response
        .status(503)
        .json({ message: "Password reset email is temporarily unavailable." });
    }
    const email =
      typeof request.body?.email === "string"
        ? request.body.email.trim().toLowerCase()
        : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return response
        .status(400)
        .json({ message: "Enter a valid email address." });
    }

    let developmentResetUrl;
    const user = await User.findOne({ email, deletedAt: null }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt",
    );
    if (user && !user.isSuspended) {
      const token = crypto.randomBytes(32).toString("hex");
      user.passwordResetTokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const resetUrl = new URL(
        "/reset-password",
        process.env.CLIENT_URL || "http://localhost:5173",
      );
      resetUrl.searchParams.set("token", token);
      if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
        developmentResetUrl = resetUrl.toString();
      }
      try {
        await sendPasswordResetEmail(user, resetUrl.toString());
      } catch (error) {
        console.error("Could not send password reset email:", error.message);
      }
      if (
        !process.env.SMTP_HOST &&
        process.env.NODE_ENV !== "production" &&
        process.env.NODE_ENV !== "test"
      ) {
        console.info(
          `Development password reset link for ${user.email}: ${resetUrl.toString()}`,
        );
      }
    }
    response.json({
      message:
        "If an eligible account exists, password reset instructions will be sent.",
      ...(developmentResetUrl ? { developmentResetUrl } : {}),
    });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(request, response, next) {
  try {
    const { token, password } = request.body || {};
    if (
      typeof token !== "string" ||
      !/^[a-f\d]{64}$/i.test(token) ||
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return response
        .status(400)
        .json({
          message:
            "Use a valid reset link and a password between 8 and 72 bytes.",
        });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
      isSuspended: false,
    }).select(
      "+passwordHash +passwordResetTokenHash +passwordResetExpiresAt +authTokenVersion",
    );
    if (!user) {
      return response
        .status(400)
        .json({
          message:
            "This reset link is invalid or has expired. Request a new one.",
        });
    }
    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.authTokenVersion += 1;
    await user.save();
    response.json({
      message:
        "Password reset successfully. Please log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
}

async function getCurrentUser(request, response, next) {
  try {
    const user = await User.findById(request.user.id);
    if (!user) {
      response.clearCookie("token", cookieOptions);
      return response
        .status(401)
        .json({ message: "Account not found. Please log in again." });
    }
    response.json({ user: userResponse(user) });
  } catch (error) {
    next(error);
  }
}

function logout(_request, response) {
  response.clearCookie("token", cookieOptions);
  response.json({ message: "Logged out successfully." });
}

module.exports = {
  adminLogin,
  getCurrentUser,
  changePassword,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  updateProfile,
};
