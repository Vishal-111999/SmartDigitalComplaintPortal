const mongoose = require("mongoose");

const complaintVoteSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      required: true,
    },
    voter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

complaintVoteSchema.index({ complaint: 1, voter: 1 }, { unique: true });
complaintVoteSchema.index({ voter: 1, createdAt: -1 });

module.exports = mongoose.model("ComplaintVote", complaintVoteSchema);
