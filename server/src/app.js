const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const path = require("path");
const adminRoutes = require("./routes/admin");
const authRoutes = require("./routes/auth");
const complaintRoutes = require("./routes/complaints");
const eventRoutes = require("./routes/events");
const notificationRoutes = require("./routes/notifications");

const app = express();
const uploadDirectory = path.join(__dirname, "..", "uploads");
const trustProxyHops = Number(process.env.TRUST_PROXY || 0);

if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY must be a non-negative integer.");
}
app.set("trust proxy", trustProxyHops);

const clientOrigin = process.env.CLIENT_URL || "http://localhost:5173";
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(
  cors({
    origin(origin, callback) {
      const isLocalDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");

      callback(null, !origin || origin === clientOrigin || isLocalDevelopmentOrigin);
    },
    credentials: true,
  }),
);
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (!origin || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  const allowedDevelopmentOrigin =
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin === clientOrigin || allowedDevelopmentOrigin) return next();
  response.status(403).json({ message: "Requests from this origin are not allowed." });
});
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(uploadDirectory));

app.get("/api/health/live", (_request, response) => {
  response.json({ status: "ok" });
});

function reportReadiness(_request, response) {
  const ready = mongoose.connection.readyState === 1;
  response.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "unavailable",
    database: ready ? "connected" : "disconnected",
  });
}

app.get("/api/health", reportReadiness);
app.get("/api/health/ready", reportReadiness);
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/admin", adminRoutes);

app.use((error, _request, response, _next) => {
  if (error.name === "MulterError" || error.message === "Only image files are allowed") {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return response.status(status).json({ message: error.message });
  }

  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ message: "Request body must contain valid JSON." });
  }

  if (error.type === "entity.too.large") {
    return response.status(413).json({ message: "Request body is too large." });
  }

  console.error(error);
  response.status(error.status || 500).json({
    message: error.status ? error.message : "Internal server error",
  });
});

module.exports = app;
