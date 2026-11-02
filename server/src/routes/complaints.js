const express = require("express");
const {
  createComplaint,
  deleteMyComplaint,
  getMyOverview,
  getMyComplaint,
  addComplaintVote,
  listCommunityComplaints,
  listMyComplaints,
  removeComplaintVote,
  updateMyComplaint,
} = require("../controllers/complaintController");
const requireAuth = require("../middleware/requireAuth");
const requireCitizen = require("../middleware/requireCitizen");
const uploadComplaintImage = require("../middleware/uploadComplaintImage");

const router = express.Router();

router.use(requireAuth, requireCitizen);
router.post("/", uploadComplaintImage, createComplaint);
router.get("/overview", getMyOverview);
router.get("/mine", listMyComplaints);
router.get("/community", listCommunityComplaints);
router.post("/:id/vote", addComplaintVote);
router.delete("/:id/vote", removeComplaintVote);
router.get("/:id", getMyComplaint);
router.patch("/:id", uploadComplaintImage, updateMyComplaint);
router.delete("/:id", deleteMyComplaint);

module.exports = router;
