const express = require("express");
const {
  listMyNotifications,
  markNotificationRead,
} = require("../controllers/notificationController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);
router.get("/", listMyNotifications);
router.patch("/:id/read", markNotificationRead);

module.exports = router;
