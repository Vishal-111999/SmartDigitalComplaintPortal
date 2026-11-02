const Notification = require("../models/Notification");

async function listMyNotifications(request, response, next) {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: request.user.id })
        .sort({ createdAt: -1, _id: -1 })
        .limit(30)
        .select("complaint type message readAt createdAt")
        .lean(),
      Notification.countDocuments({ recipient: request.user.id, readAt: null }),
    ]);
    response.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
}

async function markNotificationRead(request, response, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: "The notification ID is invalid." });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: request.params.id, recipient: request.user.id, readAt: null },
      { $set: { readAt: new Date() } },
      { returnDocument: "after" },
    ).select("readAt");
    if (!notification) {
      const exists = await Notification.exists({
        _id: request.params.id,
        recipient: request.user.id,
      });
      if (!exists) return response.status(404).json({ message: "Notification not found." });
      return response.json({ message: "Notification already read." });
    }
    response.json({ message: "Notification marked as read.", notification });
  } catch (error) {
    next(error);
  }
}

module.exports = { listMyNotifications, markNotificationRead };
