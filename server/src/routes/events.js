const express = require("express");
const { streamEvents } = require("../controllers/eventController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.get("/", requireAuth, streamEvents);

module.exports = router;
