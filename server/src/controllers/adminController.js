const Complaint = require("../models/Complaint");
const ComplaintHistory = require("../models/ComplaintHistory");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  emitComplaintDeleted,
  emitComplaintStatusUpdated,
} = require("../utils/complaintEvents");
const { decodeComplaintCursor, encodeComplaintCursor } = require("../utils/complaintCursor");
const { emitUserEvent } = require("../utils/complaintEvents");
const { sendEmail } = require("../utils/email");

const pageSize = 20;
const userPageSize = 25;
const complaintStatuses = Complaint.schema.path("status").enumValues;
const allowedStatusTransitions = {
  Pending: ["In Review", "Rejected"],
  "In Review": ["Pending", "In Progress", "Rejected"],
  "In Progress": ["In Review", "Resolved", "Rejected"],
  Resolved: ["In Progress", "Closed"],
  Closed: ["In Progress"],
  Rejected: ["In Review"],
  Submitted: ["Pending", "In Review", "In Progress", "Rejected"],
};

async function getOverview(_request, response, next) {
  try {
    const now = new Date();
    const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const [total, totalUsers, statusCounts, monthlyCounts, categoryCounts, userCounts] = await Promise.all([
      Complaint.countDocuments({ deletedAt: null }),
      User.countDocuments({ role: "citizen", deletedAt: null }),
      Complaint.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Complaint.aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: rangeStart } } },
        { $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" } },
          count: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
      Complaint.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      User.aggregate([
        { $match: { role: "citizen", createdAt: { $gte: rangeStart } } },
        { $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "UTC" } },
          count: { $sum: 1 },
        } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const counts = Object.fromEntries(complaintStatuses.map((status) => [status, 0]));
    for (const item of statusCounts) {
      counts[item._id] = item.count;
    }

    const monthKeys = Array.from({ length: 6 }, (_value, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
      return date.toISOString().slice(0, 7);
    });
    const fillMonths = (items) => {
      const values = new Map(items.map(({ _id, count }) => [_id, count]));
      return monthKeys.map((month) => ({ month, count: values.get(month) || 0 }));
    };
    response.json({
      total,
      totalUsers,
      statusCounts: counts,
      resolved: counts.Resolved || 0,
      pending: (counts.Pending || 0) + (counts.Submitted || 0),
      monthlyComplaints: fillMonths(monthlyCounts),
      monthlyUsers: fillMonths(userCounts),
      categoryCounts: categoryCounts.map(({ _id, count }) => ({ category: _id, count })),
    });
  } catch (error) {
    next(error);
  }
}

async function listComplaints(request, response, next) {
  try {
    if (request.query.includeDeleted !== undefined && !["true", "false"].includes(request.query.includeDeleted)) {
      return response.status(400).json({ message: "Choose whether to include archived complaints." });
    }
    const filter = request.query.includeDeleted === "true"
      ? { deletedAt: { $ne: null } }
      : { deletedAt: null };
    const clauses = [];
    const { status, category, cursor, search } = request.query;

    if (status !== undefined) {
      if (typeof status !== "string" || !complaintStatuses.includes(status)) {
        return response.status(400).json({ message: "Choose a valid complaint status." });
      }
      filter.status = status;
    }
    if (category !== undefined) {
      if (
        typeof category !== "string" ||
        !Complaint.schema.path("category").enumValues.includes(category)
      ) {
        return response.status(400).json({ message: "Choose a valid complaint category." });
      }
      filter.category = category;
    }

    if (search !== undefined) {
      if (typeof search !== "string" || search.trim().length > 100) {
        return response.status(400).json({ message: "Search must be 100 characters or fewer." });
      }
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (escapedSearch) {
        const searchPattern = new RegExp(escapedSearch, "i");
        clauses.push({
          $or: [
            { title: searchPattern },
            { description: searchPattern },
            { location: searchPattern },
            { category: searchPattern },
          ],
        });
      }
    }

    if (cursor !== undefined) {
      const decodedCursor = decodeComplaintCursor(cursor);
      if (!decodedCursor) {
        return response.status(400).json({ message: "The complaints cursor is invalid." });
      }
      clauses.push({
        $or: [
          { createdAt: { $lt: decodedCursor.createdAt } },
          { createdAt: decodedCursor.createdAt, _id: { $lt: decodedCursor.id } },
        ],
      });
    }

    if (clauses.length) filter.$and = clauses;

    const results = await Complaint.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .select("-__v")
      .populate("createdBy", "name email");
    const hasMore = results.length > pageSize;
    const complaints = hasMore ? results.slice(0, pageSize) : results;
    await Complaint.populate(complaints, [
      { path: "statusHistory.updatedBy", select: "name" },
      { path: "deletedBy", select: "name" },
    ]);

    response.json({
      complaints,
      nextCursor: hasMore ? encodeComplaintCursor(complaints[complaints.length - 1]) : null,
    });
  } catch (error) {
    next(error);
  }
}

async function updateComplaintStatus(request, response, next) {
  try {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return response.status(400).json({ message: "Choose a valid complaint status." });
    }

    const { status, adminResponse, priority, department } = request.body;
    if (typeof status !== "string" || !complaintStatuses.includes(status)) {
      return response.status(400).json({ message: "Choose a valid complaint status." });
    }
    if (
      adminResponse !== undefined &&
      (typeof adminResponse !== "string" || adminResponse.trim().length > 1000)
    ) {
      return response.status(400).json({ message: "The response must be 1000 characters or fewer." });
    }
    if (
      priority !== undefined &&
      (typeof priority !== "string" || !Complaint.schema.path("priority").enumValues.includes(priority))
    ) {
      return response.status(400).json({ message: "Choose a valid complaint priority." });
    }
    if (
      department !== undefined &&
      (typeof department !== "string" || !Complaint.schema.path("department").enumValues.includes(department))
    ) {
      return response.status(400).json({ message: "Choose a valid department." });
    }

    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }

    const complaint = await Complaint.findOne({ _id: request.params.id, deletedAt: null });

    if (!complaint) {
      return response.status(404).json({ message: "Complaint not found." });
    }

    const previousStatus = complaint.status;
    const previousPriority = complaint.priority;
    const previousDepartment = complaint.department;
    const previousResponse = complaint.adminResponse;
    if (
      status !== previousStatus &&
      !allowedStatusTransitions[previousStatus]?.includes(status)
    ) {
      return response.status(409).json({
        message: `A complaint cannot move from ${previousStatus} to ${status}.`,
      });
    }
    const now = new Date();
    complaint.status = status;
    if (priority !== undefined) complaint.priority = priority;
    if (department !== undefined) complaint.department = department;
    complaint.reviewedBy = request.user.id;
    complaint.reviewedAt = complaint.reviewedAt || now;
    complaint.resolvedAt = status === "Resolved"
      ? complaint.resolvedAt || now
      : status === "Closed"
        ? complaint.resolvedAt
        : null;
    if (adminResponse !== undefined) complaint.adminResponse = adminResponse.trim();
    const responseChanged = adminResponse !== undefined && adminResponse.trim() !== previousResponse;
    const departmentChanged = department !== undefined && department !== previousDepartment;
    const priorityChanged = priority !== undefined && priority !== previousPriority;
    if (status !== previousStatus || responseChanged || departmentChanged || priorityChanged) {
      complaint.statusHistory.push({
        status,
        message: responseChanged
          ? adminResponse.trim()
          : status !== previousStatus
            ? `Status changed to ${status}.`
            : departmentChanged
              ? `Assigned to ${department}.`
              : priorityChanged
                ? `Priority changed to ${priority}.`
                : "",
        updatedBy: request.user.id,
        updatedAt: now,
      });
      if (complaint.statusHistory.length > 50) {
        complaint.statusHistory.splice(0, complaint.statusHistory.length - 50);
      }
    }

    await complaint.save();
    const history = [];
    if (status !== previousStatus) {
      history.push({
        complaint: complaint._id,
        action: "Status Updated",
        message: `Status changed to ${status}.`,
        fromValue: previousStatus,
        toValue: status,
        actor: request.user.id,
        createdAt: now,
      });
    }
    if (departmentChanged) {
      history.push({
        complaint: complaint._id,
        action: "Department Assigned",
        message: `Assigned to ${department}.`,
        fromValue: previousDepartment || "",
        toValue: department,
        actor: request.user.id,
        createdAt: now,
      });
    }
    if (responseChanged && adminResponse.trim()) {
      history.push({
        complaint: complaint._id,
        action: "Remark Added",
        message: adminResponse.trim(),
        actor: request.user.id,
        createdAt: now,
      });
    }
    if (priorityChanged) {
      history.push({
        complaint: complaint._id,
        action: "Complaint Updated",
        message: `Priority changed to ${priority}.`,
        fromValue: previousPriority,
        toValue: priority,
        actor: request.user.id,
        createdAt: now,
      });
    }
    if (history.length) await ComplaintHistory.insertMany(history);
    if (responseChanged || status !== previousStatus) {
      const responseText = adminResponse?.trim();
      const message = responseChanged && responseText
        ? `New admin response: ${responseText}`.slice(0, 250)
        : `Your complaint status is now ${status}: ${complaint.title}`.slice(0, 250);
      await Notification.create({
        recipient: complaint.createdBy,
        complaint: complaint._id,
        type: "complaint-updated",
        message,
      }).catch((error) => {
        console.error("Could not save complaint update notification:", error.message);
      });
      const owner = await User.findById(complaint.createdBy).select("name email").lean();
      if (owner) {
        await sendEmail({
          to: owner.email,
          subject: `Complaint update: ${complaint.title}`,
          text: `Hello ${owner.name},\n\n${message}\n\nCurrent status: ${status}\n${adminResponse?.trim() ? `Staff response: ${adminResponse.trim()}\n` : ""}\nSign in to the Complaint Portal to view the full history.`,
        }).catch((error) => {
          console.error("Could not send complaint update email:", error.message);
        });
      }
    }
    await complaint.populate("createdBy", "name email");
    await complaint.populate("statusHistory.updatedBy", "name");
    emitComplaintStatusUpdated(complaint);
    response.json({ complaint: complaint.toObject({ versionKey: false }) });
  } catch (error) {
    if (error.name === "VersionError") {
      return response.status(409).json({
        message: "Another admin updated this complaint. Refresh the page and try again.",
      });
    }
    if (error.name === "ValidationError") {
      return response.status(400).json({ message: "Check the complaint update and try again." });
    }
    next(error);
  }
}

async function getComplaintDetails(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const complaint = await Complaint.findById(request.params.id)
      .populate("createdBy", "name email mobile address")
      .populate("reviewedBy", "name")
      .populate("deletedBy", "name")
      .populate("statusHistory.updatedBy", "name")
      .lean();
    if (!complaint) return response.status(404).json({ message: "Complaint not found." });
    let history = await ComplaintHistory.find({ complaint: complaint._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .populate("actor", "name")
      .lean();
    const storedHistoryTotal = await ComplaintHistory.countDocuments({ complaint: complaint._id });
    if (history.length === 0) {
      history = (complaint.statusHistory || []).map((entry) => ({
        action: "Status Updated",
        message: entry.message || `Status: ${entry.status}`,
        fromValue: "",
        toValue: entry.status,
        actor: entry.updatedBy,
        createdAt: entry.updatedAt,
      })).reverse();
    }
    const historyTotal = Math.max(storedHistoryTotal, history.length);
    response.json({ complaint, history, historyTotal });
  } catch (error) {
    next(error);
  }
}

async function getComplaintHistory(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const page = Number(request.query.page || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) {
      return response.status(400).json({ message: "Choose a valid history page." });
    }
    const complaint = await Complaint.findById(request.params.id)
      .select("statusHistory")
      .populate("statusHistory.updatedBy", "name")
      .lean();
    if (!complaint) return response.status(404).json({ message: "Complaint not found." });
    const filter = { complaint: request.params.id };
    const [history, total] = await Promise.all([
      ComplaintHistory.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 50)
        .limit(50)
        .populate("actor", "name")
        .lean(),
      ComplaintHistory.countDocuments(filter),
    ]);
    if (total > 0) {
      return response.json({ history, total, page, pageSize: 50 });
    }

    const legacyHistory = (complaint.statusHistory || [])
      .map((entry) => ({
        action: "Status Updated",
        message: entry.message || `Status: ${entry.status}`,
        fromValue: "",
        toValue: entry.status,
        actor: entry.updatedBy,
        createdAt: entry.updatedAt,
      }))
      .reverse();
    const offset = (page - 1) * 50;
    response.json({
      history: legacyHistory.slice(offset, offset + 50),
      total: legacyHistory.length,
      page,
      pageSize: 50,
    });
  } catch (error) {
    next(error);
  }
}

async function setComplaintAssignment(request, response, next) {
  try {
    if (!request.body || typeof request.body.department !== "string") {
      return response.status(400).json({ message: "Choose a valid department." });
    }
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }
    const complaint = await Complaint.findOne({ _id: request.params.id, deletedAt: null }).select("status");
    if (!complaint) return response.status(404).json({ message: "Complaint not found." });
    request.body = { status: complaint.status, department: request.body.department };
    return updateComplaintStatus(request, response, next);
  } catch (error) {
    next(error);
  }
}

async function listCitizens(request, response, next) {
  try {
    const page = Number(request.query.page || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) {
      return response.status(400).json({ message: "Choose a valid page number." });
    }
    const filter = { role: "citizen" };
    if (request.query.search !== undefined) {
      if (typeof request.query.search !== "string" || request.query.search.trim().length > 100) {
        return response.status(400).json({ message: "Search must be 100 characters or fewer." });
      }
      const search = new RegExp(request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: search }, { email: search }, { mobile: search }];
    }
    filter.deletedAt = null;
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * userPageSize)
        .limit(userPageSize)
        .select("name email mobile address isSuspended createdAt")
        .lean(),
      User.countDocuments(filter),
    ]);
    response.json({ users, total, page, pageSize: userPageSize });
  } catch (error) {
    next(error);
  }
}

async function getCitizenDetails(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The user ID is invalid." });
    }
    const page = Number(request.query.page || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) {
      return response.status(400).json({ message: "Choose a valid complaint page." });
    }
    const user = await User.findOne({
      _id: request.params.id,
      role: "citizen",
    })
      .select("name email mobile address isSuspended createdAt deletedAt deletedBy")
      .populate("deletedBy", "name")
      .lean();
    if (!user) return response.status(404).json({ message: "Citizen account not found." });
    const filter = { createdBy: user._id };
    const [complaints, complaintTotal] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select("title category priority location status department createdAt deletedAt")
        .lean(),
      Complaint.countDocuments(filter),
    ]);
    response.json({ user, complaints, complaintTotal, page, pageSize });
  } catch (error) {
    next(error);
  }
}

async function setCitizenSuspension(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The user ID is invalid." });
    }
    if (typeof request.body?.suspended !== "boolean") {
      return response.status(400).json({ message: "Choose whether to suspend or restore this account." });
    }
    const user = await User.findOneAndUpdate(
      { _id: request.params.id, role: "citizen", deletedAt: null },
      { $set: { isSuspended: request.body.suspended } },
      { returnDocument: "after" },
    ).select("name email mobile address isSuspended createdAt");
    if (!user) return response.status(404).json({ message: "Citizen account not found." });
    if (user.isSuspended) {
      emitUserEvent(user._id, { type: "account-suspended" });
    }
    response.json({ user });
  } catch (error) {
    next(error);
  }
}

async function deleteCitizen(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The user ID is invalid." });
    }
    if (request.params.id === request.user.id) {
      return response.status(409).json({ message: "You cannot delete your own administrator account." });
    }
    const now = new Date();
    const user = await User.findOneAndUpdate(
      { _id: request.params.id, role: "citizen", deletedAt: null },
      {
        $set: { deletedAt: now, deletedBy: request.user.id, isSuspended: true },
        $inc: { authTokenVersion: 1 },
      },
      { returnDocument: "after" },
    ).select("name email mobile");
    if (!user) return response.status(404).json({ message: "Citizen account not found." });
    emitUserEvent(user._id, { type: "account-suspended" });
    response.json({ message: "Citizen account deleted. Complaint and audit records were retained.", id: user._id });
  } catch (error) {
    next(error);
  }
}

async function deleteComplaint(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The complaint ID is invalid." });
    }

    const complaint = await Complaint.findOne({ _id: request.params.id, deletedAt: null });
    if (!complaint) {
      return response.status(404).json({ message: "Complaint not found." });
    }

    const deletedAt = new Date();
    complaint.deletedAt = deletedAt;
    complaint.deletedBy = request.user.id;
    await complaint.save();
    await ComplaintHistory.create({
      complaint: complaint._id,
      action: "Complaint Deleted",
      message: "Complaint was removed from active administration.",
      actor: request.user.id,
      createdAt: deletedAt,
    });
    await Notification.create({
      recipient: complaint.createdBy,
      complaint: complaint._id,
      type: "complaint-deleted",
      message: `The complaint team removed your report: ${complaint.title}`,
    }).catch((error) => {
      console.error("Could not save complaint deletion notification:", error.message);
    });
    emitComplaintDeleted(complaint);
    response.json({ message: "Complaint archived successfully. Its history and evidence were retained.", id: complaint._id });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deleteComplaint,
  deleteCitizen,
  getCitizenDetails,
  getComplaintDetails,
  getComplaintHistory,
  getOverview,
  listCitizens,
  listComplaints,
  setComplaintAssignment,
  setCitizenSuspension,
  updateComplaintStatus,
};
