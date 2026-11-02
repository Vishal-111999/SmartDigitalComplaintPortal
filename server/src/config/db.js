const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const ComplaintHistory = require("../models/ComplaintHistory");
const ComplaintVote = require("../models/ComplaintVote");
const Notification = require("../models/Notification");
const User = require("../models/User");

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
    autoIndex: false,
  });

  await Promise.all([
    User.createIndexes(),
    Complaint.createIndexes(),
    ComplaintHistory.createIndexes(),
    ComplaintVote.createIndexes(),
    Notification.createIndexes(),
  ]);
  console.info(
    `MongoDB Atlas connected to database "${mongoose.connection.name}"`,
  );

  mongoose.connection.on("disconnected", () => {
    console.error("MongoDB connection was lost.");
  });
  mongoose.connection.on("reconnected", () => {
    console.info("MongoDB connection restored.");
  });
  mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", error.message);
  });
}

module.exports = connectDB;
