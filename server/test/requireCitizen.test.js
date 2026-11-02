const assert = require("node:assert/strict");
const test = require("node:test");
const requireCitizen = require("../src/middleware/requireCitizen");

test("citizens can access citizen complaint endpoints", () => {
  let continued = false;
  requireCitizen(
    { user: { role: "citizen" } },
    { status() { throw new Error("Unexpected rejection."); } },
    () => { continued = true; },
  );
  assert.equal(continued, true);
});

test("admins cannot use citizen complaint endpoints", () => {
  let continued = false;
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  requireCitizen(
    { user: { role: "admin" } },
    response,
    () => { continued = true; },
  );

  assert.equal(continued, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, "Citizen access is required for this action.");
});
