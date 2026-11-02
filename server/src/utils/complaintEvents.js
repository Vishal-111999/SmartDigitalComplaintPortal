const { EventEmitter } = require("events");

const events = new EventEmitter();
events.setMaxListeners(0);

function emitComplaintEvent(complaint, event) {
  const owner = complaint.createdBy?._id || complaint.createdBy;
  events.emit("admin", event);
  events.emit(`user:${owner}`, event);
}

function emitComplaintCreated(complaint) {
  emitComplaintEvent(complaint, { type: "created" });
}

function emitComplaintStatusUpdated(complaint) {
  emitComplaintEvent(complaint, { type: "status-updated" });
}

function emitComplaintDeleted(complaint) {
  emitComplaintEvent(complaint, { type: "deleted" });
}

function emitUserEvent(userId, event) {
  events.emit(`user:${userId}`, event);
}

function subscribeToComplaintEvents(topic, listener) {
  events.on(topic, listener);
  return () => events.off(topic, listener);
}

module.exports = {
  emitComplaintCreated,
  emitComplaintDeleted,
  emitComplaintStatusUpdated,
  emitUserEvent,
  subscribeToComplaintEvents,
};
