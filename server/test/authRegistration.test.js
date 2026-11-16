const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const Module = require("node:module");
const test = require("node:test");

function mockModule(modulePath, exports) {
  const resolvedPath = require.resolve(modulePath);
  const previous = require.cache[resolvedPath];
  const mocked = new Module(resolvedPath);
  mocked.filename = resolvedPath;
  mocked.exports = exports;
  mocked.loaded = true;
  require.cache[resolvedPath] = mocked;
  return () => {
    if (previous) require.cache[resolvedPath] = previous;
    else delete require.cache[resolvedPath];
  };
}

const userModel = {
  findOne: () => ({ select: async () => null }),
  create: async () => { throw new Error("User creation was not expected."); },
};
const complaintModel = {
  find: () => ({
    select() { return this; },
    lean: async () => [],
  }),
  deleteMany: async () => ({ deletedCount: 0 }),
  updateMany: async () => ({ modifiedCount: 0 }),
};
const complaintHistoryModel = {
  deleteMany: async () => ({ deletedCount: 0 }),
  updateMany: async () => ({ modifiedCount: 0 }),
};
const complaintVoteModel = {
  deleteMany: async () => ({ deletedCount: 0 }),
};
const notificationModel = {
  deleteMany: async () => ({ deletedCount: 0 }),
};
const registrationOtpModel = {
  findOneAndUpdate: async () => { throw new Error("OTP creation was not expected."); },
  findOne: () => ({ select: async () => null }),
  updateOne: async () => ({ modifiedCount: 0 }),
  deleteOne: async () => ({ deletedCount: 0 }),
};
let emailedOtp;
const emailModule = {
  sendEmail: async ({ text }) => {
    emailedOtp = text.match(/code is (\d{6})\./)[1];
    return true;
  },
};
const restoreModules = [
  mockModule("../src/models/Complaint", complaintModel),
  mockModule("../src/models/ComplaintHistory", complaintHistoryModel),
  mockModule("../src/models/ComplaintVote", complaintVoteModel),
  mockModule("../src/models/Notification", notificationModel),
  mockModule("../src/models/User", userModel),
  mockModule("../src/models/RegistrationOtp", registrationOtpModel),
  mockModule("../src/utils/email", emailModule),
];
const { deleteAccount, register, verifyRegistrationEmail } = require("../src/controllers/authController");
restoreModules.forEach((restore) => restore());

const previousEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_FROM: process.env.SMTP_FROM,
};

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    cookie(...args) {
      this.cookies.push(args);
    },
    clearCookie(...args) {
      this.clearedCookies.push(args);
    },
  };
}

test("registration requires email delivery and a valid code before creating a user", async () => {
  process.env.NODE_ENV = "development";
  process.env.JWT_SECRET = "test-secret-for-registration-controller";
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;

  let pendingRegistration;
  let createdUser;
  let failedAttempts = 0;
  registrationOtpModel.findOneAndUpdate = async (_filter, update) => {
    pendingRegistration = { ...update.$set, _id: "pending-registration" };
  };
  registrationOtpModel.findOne = () => ({
    select: async () => pendingRegistration,
  });
  registrationOtpModel.updateOne = async () => {
    failedAttempts += 1;
    return { modifiedCount: 1 };
  };
  registrationOtpModel.deleteOne = async () => ({ deletedCount: 1 });
  userModel.findOne = () => ({ select: async () => null });
  userModel.create = async (data) => {
    createdUser = {
      ...data,
      _id: { toString: () => "resident-1" },
      role: "citizen",
      authTokenVersion: 0,
    };
    return createdUser;
  };

  try {
    const unavailableResponse = createResponse();
    await register(
      {
        body: {
          name: "Asha Sharma",
          email: "asha@example.com",
          mobile: "9876543210",
          address: "Ward 4",
          password: "A-private-password",
        },
      },
      unavailableResponse,
      (error) => { throw error; },
    );
    assert.equal(unavailableResponse.statusCode, 503);
    assert.equal(pendingRegistration, undefined);
    assert.equal(createdUser, undefined);

    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "noreply@example.com";
    const registrationResponse = createResponse();
    await register(
      {
        body: {
          name: "Asha Sharma",
          email: "asha@example.com",
          mobile: "9876543210",
          address: "Ward 4",
          password: "A-private-password",
        },
      },
      registrationResponse,
      (error) => { throw error; },
    );

    assert.equal(registrationResponse.statusCode, 202);
    assert.equal(registrationResponse.body.user, undefined);
    assert.equal(registrationResponse.body.developmentOtp, undefined);
    assert.equal(emailedOtp.length, 6);
    assert.notEqual(pendingRegistration.otpHash, emailedOtp);
    assert.equal(createdUser, undefined);

    const invalidResponse = createResponse();
    const invalidOtp = emailedOtp === "000000"
      ? "000001"
      : "000000";
    await verifyRegistrationEmail(
      { body: { email: "asha@example.com", otp: invalidOtp } },
      invalidResponse,
      (error) => { throw error; },
    );
    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(failedAttempts, 1);
    assert.equal(createdUser, undefined);

    const verifiedResponse = createResponse();
    await verifyRegistrationEmail(
      {
        body: {
          email: "asha@example.com",
          otp: emailedOtp,
        },
      },
      verifiedResponse,
      (error) => { throw error; },
    );
    assert.equal(verifiedResponse.statusCode, 201);
    assert.equal(verifiedResponse.body.user.email, "asha@example.com");
    assert.equal(verifiedResponse.cookies.length, 1);
    assert.ok(createdUser.emailVerifiedAt instanceof Date);
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("account deletion checks the current password and permanently removes associated data", async () => {
  process.env.JWT_SECRET = "test-secret-for-registration-controller";
  const passwordHash = await bcrypt.hash("Correct-password", 4);
  const user = {
    _id: "resident-1",
    email: "resident@example.com",
    passwordHash,
    role: "citizen",
    deletedAt: null,
    isSuspended: false,
  };
  const operations = {};
  userModel.findById = () => ({ select: async () => user });
  userModel.findOneAndDelete = (filter) => ({
    select: async () => {
      operations.user = filter;
      return { _id: user._id };
    },
  });
  complaintModel.find = (filter) => {
    operations.complaints = filter;
    return {
      select(selection) {
        operations.complaintSelection = selection;
        return this;
      },
      lean: async () => [{
        _id: "complaint-1",
        imagePath: "/uploads/missing-test-image.jpg",
      }],
    };
  };
  complaintHistoryModel.deleteMany = async (filter) => {
    operations.complaintHistory = filter;
    return { deletedCount: 1 };
  };
  complaintHistoryModel.updateMany = async (filter, update) => {
    operations.historyActors = { filter, update };
    return { modifiedCount: 1 };
  };
  complaintVoteModel.deleteMany = async (filter) => {
    operations.votes = filter;
    return { deletedCount: 1 };
  };
  notificationModel.deleteMany = async (filter) => {
    operations.notifications = filter;
    return { deletedCount: 1 };
  };
  complaintModel.deleteMany = async (filter) => {
    operations.complaintDeletion = filter;
    return { deletedCount: 1 };
  };
  complaintModel.updateMany = async (filter, update, options) => {
    operations.complaintAttribution = operations.complaintAttribution || [];
    operations.complaintAttribution.push({ filter, update, options });
    return { modifiedCount: 1 };
  };
  registrationOtpModel.deleteOne = async (filter) => {
    operations.registrationOtp = filter;
    return { deletedCount: 0 };
  };

  const invalidResponse = createResponse();
  await deleteAccount(
    { user: { id: "resident-1", role: "citizen" }, body: { currentPassword: "wrong" } },
    invalidResponse,
    (error) => { throw error; },
  );
  assert.equal(invalidResponse.statusCode, 401);
  assert.equal(operations.user, undefined);

  const deletedResponse = createResponse();
  await deleteAccount(
    { user: { id: "resident-1", role: "citizen" }, body: { currentPassword: "Correct-password" } },
    deletedResponse,
    (error) => { throw error; },
  );
  assert.equal(deletedResponse.statusCode, 200);
  assert.deepEqual(operations.complaints, { createdBy: user._id });
  assert.equal(operations.complaintSelection, "_id imagePath");
  assert.deepEqual(operations.complaintHistory, { complaint: { $in: ["complaint-1"] } });
  assert.deepEqual(operations.votes, {
    $or: [
      { voter: user._id },
      { complaint: { $in: ["complaint-1"] } },
    ],
  });
  assert.deepEqual(operations.notifications, {
    $or: [
      { recipient: user._id },
      { complaint: { $in: ["complaint-1"] } },
    ],
  });
  assert.deepEqual(operations.complaintDeletion, { createdBy: user._id });
  assert.deepEqual(operations.historyActors, {
    filter: { actor: user._id },
    update: { $set: { actor: null } },
  });
  assert.deepEqual(operations.complaintAttribution, [
    { filter: { reviewedBy: user._id }, update: { $set: { reviewedBy: null } }, options: undefined },
    { filter: { deletedBy: user._id }, update: { $set: { deletedBy: null } }, options: undefined },
    {
      filter: { "statusHistory.updatedBy": user._id },
      update: { $set: { "statusHistory.$[history].updatedBy": null } },
      options: { arrayFilters: [{ "history.updatedBy": user._id }] },
    },
  ]);
  assert.deepEqual(operations.registrationOtp, { email: user.email });
  assert.deepEqual(operations.user, {
    _id: user._id,
    role: "citizen",
    deletedAt: null,
    isSuspended: false,
  });
  assert.match(deletedResponse.body.message, /permanently deleted/);
  assert.equal(deletedResponse.clearedCookies.length, 1);
});
