# Smart Digital Complaint and Resolution System

The app lets residents submit civic complaints and track their status. It uses
React and Vite for the web client, Express and Node.js for the API, and MongoDB
for user and complaint records. The HTML files in the project root are
standalone mockups; the running app is in `client` and `server`.

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB running locally, or a MongoDB Atlas connection string
- Git and npm

## Local setup

1. Start the MongoDB service locally, or create an Atlas cluster.
2. In `server`, copy `.env.example` to `.env`. Keep the local `MONGO_URI` for
   MongoDB on your computer, or replace it with the Atlas connection string.
   Generate a private JWT secret:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Put the generated value in `JWT_SECRET`. Never commit `.env` or share a URI
   containing database credentials.
3. In the first terminal:

   ```powershell
   cd server
   npm ci
   npm run dev
   ```

4. In another terminal:

   ```powershell
   cd client
   npm ci
   npm run dev -- --host 127.0.0.1
   ```

5. Open `http://127.0.0.1:5173`. The API uses the same hostname on port 5000.
   Check `http://127.0.0.1:5000/api/health/ready` for database readiness.
6. Run the API tests with `cd server; npm test`.

## MongoDB Atlas setup

1. Create an Atlas cluster and a dedicated database user with access only to
   the application's database. Do not use the Atlas account owner's login.
2. In Atlas Network Access, allow your current public IP for development. For a
   VPS deployment, allow that server's stable outbound IP. Avoid `0.0.0.0/0`.
3. Copy the driver's connection string from Atlas, replace the password
   placeholder, and set it as `MONGO_URI` in the ignored `server/.env` file.
   URL-encode special characters in the database username or password.
4. Restart the API and confirm `/api/health/ready` reports both `ok` and
   `connected`. MongoDB creates the declared user and complaint indexes during
   server startup. The connection pool uses the driver's defaults; review
   Atlas connection and latency metrics before changing its size.

## Admin account

Admin signup is intentionally not public: public registration always creates a
citizen account. From the `server` directory, you can either promote an
existing account (the user's current password stays unchanged):

```powershell
$env:ADMIN_EMAIL = "staff@example.com"
npm run seed:admin
```

Or create the first admin account directly, without first registering it in the
citizen UI:

```powershell
$env:ADMIN_NAME = "Portal Administrator"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_MOBILE = "9876543210"
$env:ADMIN_PASSWORD = "use-a-strong-password"
npm run seed:admin
```

The command reads `MONGO_URI` from `server/.env`, hashes the new password, and
does not print or store the plaintext password. It will not create an admin
through the public API. After it succeeds, open
`http://127.0.0.1:5173/admin/login` and sign in. For a newly created account,
use `ADMIN_EMAIL` and `ADMIN_PASSWORD`; for a promoted account, use its existing
password. If the account already exists, only `ADMIN_EMAIL` is needed to grant
the admin role; sign out and sign in again to refresh the session.
Administrators can sign in separately at `http://127.0.0.1:5173/admin/login`.
The API's `POST /api/admin/login` rejects citizen accounts, and every admin API
request checks the current account role. Admins can view a separate analytics
page, open complaint case files, assign departments, add resident-visible
remarks, inspect the full audit timeline, archive complaints, and review
resident profiles and their complaints.

The admin dashboard shows complaint totals by status, searches complaint
titles/details/locations/categories, filters by status, and lets staff update
complaint progress, assign departments, set priority, send a response visible
to the resident, and archive duplicate or invalid reports. Archived complaints
can be reviewed from the admin complaint filter; their images and history are
retained. Valid workflow transitions are
`Pending -> In Review -> In Progress -> Resolved -> Closed`, with explicit
reopen/reject paths. Residents can edit or withdraw their complaints until
review begins, browse other active community reports, and privately support an
issue once. Similar same-location reports are flagged before submission, with a
resident confirmation option for genuinely separate issues.

Profile editing, single-use password reset links, citizen account suspension
and soft deletion,
resident/admin in-app notifications, optional SMTP status emails, and six-month
complaint/category/user analytics are included. Configure `SMTP_HOST`,
`SMTP_PORT`, `SMTP_FROM`, and any required `SMTP_USER`/`SMTP_PASSWORD` for email
delivery. Reset tokens expire after 30 minutes. Without SMTP in development,
the password reset page provides a local-only reset link.

Authenticated users receive complaint changes over server-sent events; resident
pages show the latest 50 status updates while the admin audit timeline retains
every new action in the separate `ComplaintHistory` collection. Notifications expire
after 90 days. The event channel runs in the API process; multi-instance
deployments need shared pub/sub and shared rate-limit storage. Citizen data is
stored in the `User` collection with a role; a separate Admin collection would
duplicate account credentials and is intentionally not used.

## Sample data, API, and Postman

Register a development citizen first, then seed three demo complaints for that
account:

```powershell
cd server
$env:SAMPLE_CITIZEN_EMAIL = "asha@example.com"
npm run seed:sample
```

Sample seeding is disabled when `NODE_ENV=production`, is safe to re-run, and
does not delete or overwrite existing complaints. Full routes, access rules,
sample payloads and response shapes are in [docs/API.md](./docs/API.md).
Import [postman/Complaint-Portal.postman_collection.json](./postman/Complaint-Portal.postman_collection.json)
into Postman. Set its URL and account variables, sign in to populate the
Postman cookie jar, and promote a separate staff account before testing admin
routes.

## Deploying to a VPS

- Install the Node.js LTS release supported by the project. Build the UI with
  `cd client; npm ci; npm run build` and run the API with
  `cd server; npm ci --omit=dev; npm start`.
- Configure `NODE_ENV=production`, `PORT`, `MONGO_URI`, a fresh random
  `JWT_SECRET`, the exact HTTPS frontend origin in `CLIENT_URL`, and
  `TRUST_PROXY` to the number of trusted reverse proxies (normally `1` behind
  one Nginx proxy). Keep secrets in the server's environment or secret manager,
  never in source control or frontend environment variables. Set the frontend
  build variable `VITE_API_URL` to the HTTPS API URL ending in `/api`; this is
  a public URL, not a secret.
- Serve the frontend and API over HTTPS. Keep the database off the public
  internet and restrict Atlas network access to the VPS egress IP. Use a
  process manager such as systemd or PM2 and monitor `/api/health/live` for
  process health and `/api/health/ready` for MongoDB readiness. Host the app
  and API on the same site (for example, `app.example.com` and
  `api.example.com`) or proxy `/api` through the frontend's domain so the
  HTTP-only session cookie works with `SameSite=Lax`.
- Login and registration limits are stored in process memory. If you run more
  than one API instance, use a shared rate-limit store.
- Configure Atlas backups and test restore procedures. Alert on database
  availability, storage, and connection usage.
- Complaint images currently use the API server's local `server/uploads`
  directory. Keep it on persistent storage and back it up, or move uploads to
  managed object storage before using multiple API instances. Add malware
  scanning for public production uploads.

The API starts only after MongoDB and the model indexes are ready. Its liveness
and readiness endpoints are separate, shutdown closes the database connection,
and complaint history is loaded in pages.

## API layout

```text
server/
  index.js                 Start, stop, and validate API configuration
  scripts/                  Admin setup and opt-in sample records
  src/
    app.js                 Express middleware and routes
    config/db.js           MongoDB connection and indexes
    models/                 User, complaint, vote and notification schemas
    controllers/            Request handling and application logic
    routes/                 URL-to-controller mappings
    middleware/             Authentication and image uploads
    utils/                  Shared helpers
  test/                     Automated tests
```

Keep route files focused on endpoint wiring; put request handling in
controllers and database schemas/indexes in models.
Citizens can create and manage only their own complaints, and can edit or
withdraw them only before staff review starts. Status changes, assignment,
priority, resident-facing staff remarks, and complaint archiving are available
only through admin-protected endpoints.
