const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");
const Complaint = require("../models/Complaint");
const ComplaintHistory = require("../models/ComplaintHistory");
const ComplaintVote = require("../models/ComplaintVote");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  emitComplaintCreated,
  emitComplaintDeleted,
  emitComplaintStatusUpdated,
} = require("../utils/complaintEvents");
const { decodeComplaintCursor, encodeComplaintCursor } = require("../utils/complaintCursor");

const complaintPageSize = 20;
const editableStatuses = new Set(["Pending", "Submitted"]);
const activePublicStatuses = ["Closed", "Rejected"];
const categoryDepartments = {
  "Road Damage": "Road Department",
  "Road Problems": "Road Department",
  "Water Supply": "Water Department",
  "Electricity Issue": "Electricity Department",
  Electricity: "Electricity Department",
  "Garbage Collection": "Sanitation Department",
  "Garbage Issue": "Sanitation Department",
  "Drainage Problem": "Drainage Department",
  "Street Light Issue": "Street Lighting Department",
  "Street Light": "Street Lighting Department",
  "Internet Issue": "Telecommunications Department",
  Other: "General Services Department",
  "Other Issues": "General Services Department",
};

function titleSimilarity(left, right) {
  const words = (value) => new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
  const first = words(left);
  const second = words(right);
  if (!first.size || !second.size) return 0;
  const shared = [...first].filter((word) => second.has(word)).length;
  return shared / (first.size + second.size - shared);
}

async function removeComplaintImage(imagePath) {
  if (!imagePath) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", path.basename(imagePath));
  await fs.promises.unlink(filePath).catch((error) => {
    if (error.code !== "ENOENT") {
      console.error("Could not remove complaint image:", error.message);
    }
  });
}

async function createComplaint(request, response, next) {
  let complaintSaved = false;
  try {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return response.status(400).json({ message: "Enter valid complaint details." });
    }
    const { title, category, priority, location, description } = request.body;
    const normalizedLocation = typeof location === "string" ? location.trim() : "";
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const escapedLocation = normalizedLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const potentialDuplicates = normalizedLocation && normalizedTitle
      ? await Complaint.find({
        category,
        location: new RegExp(`^${escapedLocation}$`, "i"),
        deletedAt: null,
        status: { $nin: activePublicStatuses },
        createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      }).select("title category location status createdAt").sort({ createdAt: -1 }).limit(10).lean()
      : [];
    const duplicates = potentialDuplicates
      .filter((candidate) => titleSimilarity(candidate.title, normalizedTitle) >= 0.65)
      .slice(0, 3);
    if (duplicates.length && request.body.confirmDuplicate !== "true") {
      if (request.file) await removeComplaintImage(`/uploads/${request.file.filename}`);
      return response.status(409).json({
        message: "Similar active complaints already exist at this location. Review them before submitting another report.",
        possibleDuplicates: duplicates,
      });
    }
    const complaint = await Complaint.create({
      title,
      category,
      priority,
      location,
      description,
      createdBy: request.user.id,
      department: categoryDepartments[category] || "General Services Department",
      imagePath: request.file ? `/uploads/${request.file.filename}` : "",
      statusHistory: [{
        status: "Pending",
        message: "Complaint submitted.",
        updatedBy: request.user.id,
      }],
    });
    complaintSaved = true;
    await ComplaintHistory.insertMany([
      {
        complaint: complaint._id,
        action: "Complaint Created",
        message: "Complaint submitted.",
        toValue: "Pending",
        actor: request.user.id,
      },
      {
        complaint: complaint._id,
        action: "Department Assigned",
        message: `Assigned to ${complaint.department}.`,
        toValue: complaint.department,
        actor: request.user.id,
      },
    ]);
    const admins = await User.find({ role: "admin", isSuspended: false }).select("_id").lean();
    if (admins.length) {
      await Notification.insertMany(admins.map(({ _id }) => ({
        recipient: _id,
        complaint: complaint._id,
        type: "complaint-created",
        message: `A new complaint was submitted: ${complaint.title}`,
      }))).catch((error) => {
        console.error("Could not save new complaint notifications:", error.message);
      });
    }
    emitComplaintCreated(complaint);
    response.status(201).json({ complaint });
  } catch (error) {
    if (request.file && !complaintSaved) await removeComplaintImage(`/uploads/${request.file.filename}`);
    if (error.name === "ValidationError") {
      return response.status(400).json({ message: "Check the complaint details and try again." });
    }
    next(error);
  }
}

async function getMyOverview(request, response, next) {
  try {
    const [total, groupedStatuses] = await Promise.all([
      Complaint.countDocuments({ createdBy: request.user.id, deletedAt: null }),
      Complaint.aggregate([
        { $match: { createdBy: new mongoose.Types.ObjectId(request.user.id), deletedAt: null } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const statusCounts = Object.fromEntries(
      Complaint.schema.path("status").enumValues.map((status) => [status, 0]),
    );
    for (const item of groupedStatuses) statusCounts[item._id] = item.count;
    response.json({
      total,
      statusCounts,
      active: total - (statusCounts.Resolved || 0) - (statusCounts.Closed || 0) - (statusCounts.Rejected || 0),
      resolved: statusCounts.Resolved || 0,
      closed: statusCounts.Closed || 0,
    });
  } catch (error) {
    next(error);
  }
}

async function getMyComplaint(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const complaint = await Complaint.findOne({
      _id: request.params.id,
      createdBy: request.user.id,
      deletedAt: null,
    }).populate("statusHistory.updatedBy", "name");
    if (!complaint) return response.status(404).json({ message: "Complaint not found." });
    if (!editableStatuses.has(complaint.status) || complaint.reviewedAt) {
      return response.status(409).json({ message: "This complaint can no longer be edited after staff review begins." });
    }
    response.json({ complaint });
  } catch (error) {
    next(error);
  }
}

async function updateMyComplaint(request, response, next) {
  let imageSaved = false;
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return response.status(400).json({ message: "Enter valid complaint details." });
    }
    const complaint = await Complaint.findOne({
      _id: request.params.id,
      createdBy: request.user.id,
      deletedAt: null,
    });
    if (!complaint) return response.status(404).json({ message: "Complaint not found." });
    if (!editableStatuses.has(complaint.status) || complaint.reviewedAt) {
      return response.status(409).json({ message: "This complaint can no longer be edited after staff review begins." });
    }

    const allowedFields = ["title", "category", "priority", "location", "description"];
    for (const field of allowedFields) {
      if (request.body[field] !== undefined) complaint[field] = request.body[field];
    }
    if (request.file) {
      request.previousImagePath = complaint.imagePath;
      complaint.imagePath = `/uploads/${request.file.filename}`;
    }
    complaint.statusHistory.push({
      status: complaint.status,
      message: "Complaint details updated by the resident.",
      updatedBy: request.user.id,
    });
    if (complaint.statusHistory.length > 50) complaint.statusHistory.shift();
    await complaint.save();
    await ComplaintHistory.create({
      complaint: complaint._id,
      action: "Complaint Updated",
      message: "Resident updated the complaint before review.",
      actor: request.user.id,
    });
    imageSaved = true;
    await complaint.populate("statusHistory.updatedBy", "name");
    if (request.file) await removeComplaintImage(request.previousImagePath);
    emitComplaintStatusUpdated(complaint);
    response.json({ complaint });
  } catch (error) {
    if (request.file && !imageSaved) await removeComplaintImage(`/uploads/${request.file.filename}`);
    if (error.name === "VersionError") {
      return response.status(409).json({ message: "This complaint changed while you were editing it. Refresh and try again." });
    }
    if (error.name === "ValidationError") {
      return response.status(400).json({ message: "Check the complaint details and try again." });
    }
    next(error);
  }
}

async function deleteMyComplaint(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const complaint = await Complaint.findOne({
      _id: request.params.id,
      createdBy: request.user.id,
      deletedAt: null,
    });
    if (!complaint) return response.status(404).json({ message: "Complaint not found." });
    if (!editableStatuses.has(complaint.status) || complaint.reviewedAt) {
      return response.status(409).json({ message: "This complaint can no longer be withdrawn after staff review begins." });
    }
    await complaint.deleteOne();
    await ComplaintVote.deleteMany({ complaint: complaint._id }).catch((error) => {
      console.error("Could not remove withdrawn complaint votes:", error.message);
    });
    emitComplaintDeleted(complaint);
    await removeComplaintImage(complaint.imagePath);
    response.json({ message: "Complaint withdrawn successfully.", id: complaint._id });
  } catch (error) {
    next(error);
  }
}

async function listMyComplaints(request, response, next) {
  try {
    const filter = { createdBy: request.user.id, deletedAt: null };
    if (request.query.status !== undefined) {
      const statuses = Complaint.schema.path("status").enumValues;
      if (typeof request.query.status !== "string" || !statuses.includes(request.query.status)) {
        return response.status(400).json({ message: "Choose a valid complaint status." });
      }
      filter.status = request.query.status;
    }
    if (request.query.category !== undefined) {
      if (
        typeof request.query.category !== "string" ||
        !Complaint.schema.path("category").enumValues.includes(request.query.category)
      ) {
        return response.status(400).json({ message: "Choose a valid complaint category." });
      }
      filter.category = request.query.category;
    }
    if (request.query.search !== undefined) {
      if (typeof request.query.search !== "string" || request.query.search.trim().length > 100) {
        return response.status(400).json({ message: "Search must be 100 characters or fewer." });
      }
      const escaped = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (escaped) {
        const search = new RegExp(escaped, "i");
        filter.$and = [{
          $or: [
            { title: search },
            { description: search },
            { location: search },
            { category: search },
          ],
        }];
      }
    }
    if (request.query.cursor !== undefined) {
      const cursor = decodeComplaintCursor(request.query.cursor);
      if (!cursor) {
        return response.status(400).json({ message: "The complaints cursor is invalid." });
      }
      const cursorFilter = { $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ] };
      filter.$and = [...(filter.$and || []), cursorFilter];
    }

    const results = await Complaint.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(complaintPageSize + 1)
      .select("-__v");
    const hasMore = results.length > complaintPageSize;
    const complaints = hasMore ? results.slice(0, complaintPageSize) : results;
    await Complaint.populate(complaints, "statusHistory.updatedBy", "name");
    response.json({
      complaints,
      nextCursor: hasMore ? encodeComplaintCursor(complaints[complaints.length - 1]) : null,
    });
  } catch (error) {
    next(error);
  }
}

async function listCommunityComplaints(request, response, next) {
  try {
    const filter = {
      createdBy: { $ne: request.user.id },
      status: { $nin: activePublicStatuses },
      deletedAt: null,
    };
    const clauses = [];
    if (request.query.status !== undefined) {
      const statuses = Complaint.schema.path("status").enumValues;
      if (typeof request.query.status !== "string" || !statuses.includes(request.query.status)) {
        return response.status(400).json({ message: "Choose a valid complaint status." });
      }
      if (activePublicStatuses.includes(request.query.status)) {
        return response.status(400).json({ message: "Only active complaints can be filtered in the community feed." });
      }
      filter.status = request.query.status;
    }
    if (request.query.category !== undefined) {
      if (
        typeof request.query.category !== "string" ||
        !Complaint.schema.path("category").enumValues.includes(request.query.category)
      ) {
        return response.status(400).json({ message: "Choose a valid complaint category." });
      }
      filter.category = request.query.category;
    }
    if (request.query.search !== undefined) {
      if (typeof request.query.search !== "string" || request.query.search.trim().length > 100) {
        return response.status(400).json({ message: "Search must be 100 characters or fewer." });
      }
      const escaped = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (escaped) {
        const search = new RegExp(escaped, "i");
        clauses.push({
          $or: [
            { title: search },
            { description: search },
            { location: search },
            { category: search },
          ],
        });
      }
    }
    if (request.query.cursor !== undefined) {
      const cursor = decodeComplaintCursor(request.query.cursor);
      if (!cursor) return response.status(400).json({ message: "The complaints cursor is invalid." });
      clauses.push({
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ],
      });
    }
    if (clauses.length) filter.$and = clauses;

    const results = await Complaint.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(complaintPageSize + 1)
      .select("title category location description imagePath status priority createdAt");
    const hasMore = results.length > complaintPageSize;
    const complaints = hasMore ? results.slice(0, complaintPageSize) : results;
    const ids = complaints.map(({ _id }) => _id);
    const [voteCounts, currentVotes] = await Promise.all([
      ComplaintVote.aggregate([
        { $match: { complaint: { $in: ids } } },
        { $group: { _id: "$complaint", count: { $sum: 1 } } },
      ]),
      ComplaintVote.find({ complaint: { $in: ids }, voter: request.user.id })
        .distinct("complaint"),
    ]);
    const countByComplaint = new Map(voteCounts.map(({ _id, count }) => [_id.toString(), count]));
    const votedIds = new Set(currentVotes.map((id) => id.toString()));
    response.json({
      complaints: complaints.map((complaint) => ({
        ...complaint.toObject(),
        votes: countByComplaint.get(complaint._id.toString()) || 0,
        votedByMe: votedIds.has(complaint._id.toString()),
      })),
      nextCursor: hasMore ? encodeComplaintCursor(complaints[complaints.length - 1]) : null,
    });
  } catch (error) {
    next(error);
  }
}

async function addComplaintVote(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const complaint = await Complaint.findOne({
      _id: request.params.id,
      createdBy: { $ne: request.user.id },
      status: { $nin: activePublicStatuses },
      deletedAt: null,
    }).select("_id");
    if (!complaint) return response.status(404).json({ message: "This complaint is not available for voting." });
    try {
      await ComplaintVote.create({ complaint: complaint._id, voter: request.user.id });
    } catch (error) {
      if (error.code === 11000) {
        return response.status(409).json({ message: "You have already supported this complaint." });
      }
      throw error;
    }
    const votes = await ComplaintVote.countDocuments({ complaint: complaint._id });
    response.status(201).json({ votes, votedByMe: true });
  } catch (error) {
    next(error);
  }
}

async function removeComplaintVote(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const complaint = await Complaint.exists({
      _id: request.params.id,
      deletedAt: null,
      status: { $nin: activePublicStatuses },
    });
    if (!complaint) {
      return response.status(404).json({ message: "This complaint is not available for voting." });
    }
    await ComplaintVote.deleteOne({ complaint: request.params.id, voter: request.user.id });
    const votes = await ComplaintVote.countDocuments({ complaint: request.params.id });
    response.json({ votes, votedByMe: false });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addComplaintVote,
  createComplaint,
  deleteMyComplaint,
  getMyOverview,
  getMyComplaint,
  listCommunityComplaints,
  listMyComplaints,
  removeComplaintVote,
  updateMyComplaint,
};
