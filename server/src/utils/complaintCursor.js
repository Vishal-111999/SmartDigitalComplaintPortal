const mongoose = require("mongoose");

function encodeComplaintCursor(complaint) {
  const cursor = {
    createdAt: complaint.createdAt.toISOString(),
    id: complaint._id.toString(),
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeComplaintCursor(value) {
  if (typeof value !== "string" || value.length > 256 || !/^[\w-]+$/.test(value)) {
    return null;
  }

  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !cursor ||
    typeof cursor.createdAt !== "string" ||
    typeof cursor.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(cursor.id)
  ) {
    return null;
  }

  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== cursor.createdAt) {
    return null;
  }

  return { createdAt, id: new mongoose.Types.ObjectId(cursor.id) };
}

module.exports = { decodeComplaintCursor, encodeComplaintCursor };
