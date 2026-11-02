const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(request, response, next) {
  const token = request.cookies.token;

  if (!token) {
    return response.status(401).json({ message: "Please log in to continue." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select(
      "role isSuspended deletedAt +authTokenVersion",
    );
    if (!user) {
      // response.clearCookie("token");
      response.clearCookie("token", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response
        .status(401)
        .json({ message: "Account not found. Please log in again." });
    }
    if (user.isSuspended) {
      // response.clearCookie("token");
      response.clearCookie("token", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response.status(403).json({
        message: "This account is suspended. Contact support for assistance.",
      });
    }
    if (user.deletedAt) {
      // response.clearCookie("token");
      response.clearCookie("token", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response.status(401).json({
        message: "This account is no longer active. Please contact support.",
      });
    }
    if ((payload.tokenVersion || 0) !== user.authTokenVersion) {
      // response.clearCookie("token");
      response.clearCookie("token", {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response
        .status(401)
        .json({ message: "Your session has expired. Please log in again." });
    }
    request.user = { id: user.id, role: user.role };
    next();
  } catch (error) {
    if (
      error.name !== "JsonWebTokenError" &&
      error.name !== "TokenExpiredError"
    ) {
      return next(error);
    }
    // response.clearCookie("token");
    response.clearCookie("token", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    response
      .status(401)
      .json({ message: "Your session has expired. Please log in again." });
  }
}

module.exports = requireAuth;
