const express = require("express");
const { rateLimit } = require("express-rate-limit");
const {
  getCurrentUser,
  changePassword,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  updateProfile,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
const registrationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts. Please try again in 15 minutes." },
});
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
});
const passwordResetLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset attempts. Please try again in 15 minutes." },
});

router.post("/register", registrationLimit, register);
router.post("/login", loginLimit, login);
router.post("/forgot-password", passwordResetLimit, requestPasswordReset);
router.post("/reset-password", passwordResetLimit, resetPassword);
router.get("/me", requireAuth, getCurrentUser);
router.patch("/me", requireAuth, updateProfile);
router.patch("/me/password", requireAuth, passwordResetLimit, changePassword);
router.post("/logout", logout);

module.exports = router;
