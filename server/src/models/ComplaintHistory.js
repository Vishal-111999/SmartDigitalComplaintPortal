const mongoose = require("mongoose");

const complaintHistorySchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
    },
    action: {
      type: String,
      enum: [
        "Complaint Created",
        "Complaint Updated",
        "Status Updated",
        "Department Assigned",
        "Remark Added",
        "Complaint Deleted",
      ],
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    fromValue: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    toValue: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { versionKey: false },
);

complaintHistorySchema.index({ complaint: 1, createdAt: -1, _id: -1 });
complaintHistorySchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model("ComplaintHistory", complaintHistorySchema);
