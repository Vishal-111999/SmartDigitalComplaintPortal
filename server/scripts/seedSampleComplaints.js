require("dotenv").config();

const mongoose = require("mongoose");
const Complaint = require("../src/models/Complaint");
const User = require("../src/models/User");

const samples = [
  {
    title: "[DEMO] Pothole near community park",
    category: "Road Damage",
    priority: "High",
    location: "Community Park, Main Road",
    description: "A large pothole is affecting vehicles and pedestrians near the main entrance.",
    status: "In Review",
  },
  {
    title: "[DEMO] Street light not working",
    category: "Street Light Issue",
    priority: "Medium",
    location: "Market Road, Ward 4",
    description: "The street light next to the bus stop has not worked for several evenings.",
    status: "In Progress",
  },
  {
    title: "[DEMO] Irregular water supply",
    category: "Water Supply",
    priority: "Medium",
    location: "Green Colony, Block B",
    description: "Residents are receiving low water pressure during the morning supply window.",
    status: "Resolved",
  },
];

async function seedSampleComplaints() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Sample data cannot be added in production.");
  }
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be configured in server/.env.");
  }
  const email = process.env.SAMPLE_CITIZEN_EMAIL?.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Set SAMPLE_CITIZEN_EMAIL to an existing citizen account.");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
    const citizen = await User.findOne({ email, role: "citizen", isSuspended: false }).select("_id");
    if (!citizen) throw new Error("No active citizen account found for SAMPLE_CITIZEN_EMAIL.");

    let created = 0;
    for (const sample of samples) {
      const existing = await Complaint.exists({ createdBy: citizen._id, title: sample.title });
      if (existing) continue;
      const submittedAt = new Date();
      const complaint = await Complaint.create({
        ...sample,
        createdBy: citizen._id,
        statusHistory: [{
          status: "Pending",
          message: "Sample complaint submitted.",
          updatedBy: citizen._id,
          updatedAt: submittedAt,
        }, ...(sample.status === "Pending" ? [] : [{
          status: sample.status,
          message: `Sample status set to ${sample.status}.`,
          updatedBy: citizen._id,
          updatedAt: new Date(submittedAt.getTime() + 60_000),
        }])],
        reviewedAt: sample.status === "Pending" ? null : new Date(submittedAt.getTime() + 60_000),
        resolvedAt: sample.status === "Resolved" ? new Date(submittedAt.getTime() + 60_000) : null,
      });
      created += 1;
      console.info(`Created ${complaint.title}`);
    }
    console.info(`Sample data ready. Added ${created} complaint(s) for ${email}.`);
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

seedSampleComplaints().catch((error) => {
  console.error("Could not seed sample complaints:", error.message);
  process.exitCode = 1;
});
