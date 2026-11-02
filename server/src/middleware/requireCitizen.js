function requireCitizen(request, response, next) {
  if (request.user.role !== "citizen") {
    return response.status(403).json({ message: "Citizen access is required for this action." });
  }
  next();
}

module.exports = requireCitizen;
