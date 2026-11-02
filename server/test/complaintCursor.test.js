const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const {
  decodeComplaintCursor,
  encodeComplaintCursor,
} = require("../src/utils/complaintCursor");

test("complaint cursor round-trips a creation date and document id", () => {
  const complaint = {
    createdAt: new Date("2026-10-15T00:00:00.000Z"),
    _id: new mongoose.Types.ObjectId("68efc1000000000000000001"),
  };

  const decoded = decodeComplaintCursor(encodeComplaintCursor(complaint));

  assert.deepEqual(decoded, {
    createdAt: complaint.createdAt,
    id: complaint._id,
  });
});

test("complaint cursor rejects malformed values", () => {
  for (const value of [undefined, "", "not-a-cursor", "%%%", "[]"]) {
    assert.equal(decodeComplaintCursor(value), null);
  }
});

test("complaint cursor rejects invalid dates and document ids", () => {
  const invalidCursors = [
    { createdAt: "not-a-date", id: "68efc1000000000000000001" },
    { createdAt: "2026-10-15T00:00:00.000Z", id: "not-an-object-id" },
  ];

  for (const value of invalidCursors) {
    const cursor = Buffer.from(JSON.stringify(value)).toString("base64url");
    assert.equal(decodeComplaintCursor(cursor), null);
  }
});
