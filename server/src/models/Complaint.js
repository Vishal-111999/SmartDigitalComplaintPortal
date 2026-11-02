const mongoose = require("mongoose");

const complaintHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "Pending", "In Review", "In Progress", "Resolved", "Closed",
        "Submitted", "Rejected",
      ],
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: false },
);

const complaintSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Road Damage",
        "Road Problems",
        "Water Supply",
        "Electricity Issue",
        "Electricity",
        "Garbage Collection",
        "Garbage Issue",
        "Drainage Problem",
        "Street Light Issue",
        "Street Light",
        "Internet Issue",
        "Other",
        "Other Issues",
      ],
    },
    priority: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Urgent"],
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    imagePath: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "Pending", "In Review", "In Progress", "Resolved", "Closed",
        "Submitted", "Rejected",
      ],
      default: "Pending",
    },
    adminResponse: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    department: {
      type: String,
      enum: [
        "Road Department",
        "Water Department",
        "Electricity Department",
        "Sanitation Department",
        "Drainage Department",
        "Street Lighting Department",
        "Telecommunications Department",
        "General Services Department",
      ],
      default: "General Services Department",
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    statusHistory: {
      type: [complaintHistorySchema],
      default: [],
      validate: {
        validator: (history) => history.length <= 50,
        message: "A complaint can have at most 50 status history entries.",
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);

complaintSchema.index({ createdBy: 1, createdAt: -1, _id: -1 });
complaintSchema.index({ createdAt: -1, _id: -1 });
complaintSchema.index({ status: 1, createdAt: -1, _id: -1 });
complaintSchema.index({ deletedAt: 1, status: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Complaint", complaintSchema);
