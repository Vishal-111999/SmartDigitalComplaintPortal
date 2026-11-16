const express = require("express");
const { rateLimit } = require("express-rate-limit");
const {
  getCurrentUser,
  changePassword,
  login,
  logout,
  register,
  deleteAccount,
  resendRegistrationOtp,
  requestPasswordReset,
  resetPassword,
  updateProfile,
  verifyRegistrationEmail,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");
const requireCitizen = require("../middleware/requireCitizen");

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
const registrationVerificationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please try again in 15 minutes." },
});
const registrationResendLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification emails requested. Please try again in 15 minutes." },
});

router.post("/register", registrationLimit, register);
router.post("/register/verify-email", registrationVerificationLimit, verifyRegistrationEmail);
router.post("/register/resend-code", registrationResendLimit, resendRegistrationOtp);
router.post("/login", loginLimit, login);
router.post("/forgot-password", passwordResetLimit, requestPasswordReset);
router.post("/reset-password", passwordResetLimit, resetPassword);
router.get("/me", requireAuth, getCurrentUser);
router.patch("/me", requireAuth, updateProfile);
router.delete("/me", requireAuth, requireCitizen, passwordResetLimit, deleteAccount);
router.patch("/me/password", requireAuth, passwordResetLimit, changePassword);
router.post("/logout", logout);

module.exports = router;
