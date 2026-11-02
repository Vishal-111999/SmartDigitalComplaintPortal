require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./src/app");
const connectDB = require("./src/config/db");

const port = Number(process.env.PORT || 5000);

if (!process.env.MONGO_URI) {
  throw new Error(
    "MONGO_URI is required. Copy .env.example to .env and configure it.",
  );
}

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  process.env.JWT_SECRET.startsWith("replace-")
) {
  throw new Error(
    "JWT_SECRET must be a private random value with at least 32 characters.",
  );
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port between 1 and 65535.");
}

async function start() {
  await connectDB();
  const server = app.listen(port, "0.0.0.0", () => {
    console.info(`API server listening on port ${port}`);
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`${signal} received; closing the API server.`);

    const forceExit = setTimeout(() => {
      console.error("Graceful shutdown timed out.");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close((error) => {
      if (error) {
        console.error("Could not close the API server cleanly:", error.message);
        process.exitCode = 1;
      }
      mongoose
        .disconnect()
        .then(() => {
          clearTimeout(forceExit);
        })
        .catch((disconnectError) => {
          console.error(
            "Could not close the MongoDB connection cleanly:",
            disconnectError.message,
          );
          process.exitCode = 1;
        });
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
