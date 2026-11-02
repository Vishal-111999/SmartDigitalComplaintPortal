const assert = require("node:assert/strict");
const test = require("node:test");
const {
  emitComplaintCreated,
  emitComplaintStatusUpdated,
  subscribeToComplaintEvents,
} = require("../src/utils/complaintEvents");

test("a new complaint only notifies admins and its owner", () => {
  const adminEvents = [];
  const ownerEvents = [];
  const otherUserEvents = [];
  const unsubscribeAdmin = subscribeToComplaintEvents("admin", (event) => adminEvents.push(event));
  const unsubscribeOwner = subscribeToComplaintEvents("user:resident-1", (event) => ownerEvents.push(event));
  const unsubscribeOther = subscribeToComplaintEvents("user:resident-2", (event) => otherUserEvents.push(event));

  try {
    emitComplaintCreated({ createdBy: "resident-1" });

    assert.deepEqual(adminEvents, [{ type: "created" }]);
    assert.deepEqual(ownerEvents, [{ type: "created" }]);
    assert.deepEqual(otherUserEvents, []);
  } finally {
    unsubscribeAdmin();
    unsubscribeOwner();
    unsubscribeOther();
  }
});

test("a status change only notifies admins and the complaint owner", () => {
  const adminEvents = [];
  const ownerEvents = [];
  const unsubscribeAdmin = subscribeToComplaintEvents("admin", (event) => adminEvents.push(event));
  const unsubscribeOwner = subscribeToComplaintEvents("user:resident-1", (event) => ownerEvents.push(event));

  try {
    emitComplaintStatusUpdated({ createdBy: "resident-1" });

    assert.deepEqual(adminEvents, [{ type: "status-updated" }]);
    assert.deepEqual(ownerEvents, [{ type: "status-updated" }]);
  } finally {
    unsubscribeAdmin();
    unsubscribeOwner();
  }
});

test("a status change reaches the owner when the complaint owner is populated", () => {
  const ownerEvents = [];
  const unsubscribeOwner = subscribeToComplaintEvents("user:resident-1", (event) => ownerEvents.push(event));

  try {
    emitComplaintStatusUpdated({ createdBy: { _id: "resident-1", name: "Resident" } });
    assert.deepEqual(ownerEvents, [{ type: "status-updated" }]);
  } finally {
    unsubscribeOwner();
  }
});

test("unsubscribed clients no longer receive complaint updates", () => {
  let received = 0;
  const unsubscribe = subscribeToComplaintEvents("admin", () => { received += 1; });

  unsubscribe();
  emitComplaintCreated({ createdBy: "resident-1" });

  assert.equal(received, 0);
});
