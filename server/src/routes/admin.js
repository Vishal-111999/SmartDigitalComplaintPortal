const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { adminLogin, logout } = require("../controllers/authController");
const {
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
} = require("../controllers/adminController");
const requireAdmin = require("../middleware/requireAdmin");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many administrator login attempts. Please try again in 15 minutes." },
});

router.post("/login", loginLimit, adminLogin);
router.use(requireAuth, requireAdmin);
router.post("/logout", logout);
router.get("/overview", getOverview);
router.get("/dashboard", getOverview);
router.get("/users", listCitizens);
router.get("/users/:id", getCitizenDetails);
router.patch("/users/:id/suspension", setCitizenSuspension);
router.put("/users/:id/suspend", (request, _response, next) => { request.body = { suspended: true }; next(); }, setCitizenSuspension);
router.put("/users/:id/activate", (request, _response, next) => { request.body = { suspended: false }; next(); }, setCitizenSuspension);
router.delete("/users/:id", deleteCitizen);
router.get("/complaints", listComplaints);
router.get("/complaints/:id/history", getComplaintHistory);
router.get("/complaints/:id", getComplaintDetails);
router.patch("/complaints/:id/status", updateComplaintStatus);
router.put("/complaints/:id/status", updateComplaintStatus);
router.patch("/complaints/:id/assignment", setComplaintAssignment);
router.delete("/complaints/:id", deleteComplaint);

module.exports = router;
