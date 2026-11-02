# Complaint Portal API

The API is rooted at `/api`. JSON endpoints use `application/json`; complaint
create/update endpoints accept `multipart/form-data` when an image is included.
Authentication uses a signed, HTTP-only `token` cookie. The browser client sends
it automatically with credentials; Postman can store the cookie in its cookie
jar. Never put the JWT or reset token in application logs.

## Health

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health/live` | Public | Process liveness |
| GET | `/health/ready` | Public | API and MongoDB readiness |

## Authentication and account

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public, rate limited | Create a citizen account |
| POST | `/auth/login` | Public, rate limited | Start a citizen session |
| POST | `/auth/logout` | Public | Clear the session cookie |
| GET | `/auth/me` | Citizen/admin | Read the current profile |
| PATCH | `/auth/me` | Citizen/admin | Update name, mobile number, and address |
| PATCH | `/auth/me/password` | Citizen/admin | Change password and revoke other sessions |
| POST | `/auth/forgot-password` | Public, rate limited | Send a one-time password reset link |
| POST | `/auth/reset-password` | Public, rate limited | Reset with a valid 30-minute token |

Administrators use the separate `POST /admin/login` endpoint. It only creates a
session for accounts with the database role `admin`; administrator logout is
available through both `/admin/logout` and `/auth/logout`. Admin API routes
require the current database role on every request.

Example registration request:

```json
{
  "name": "Asha Sharma",
  "email": "asha@example.com",
  "mobile": "9876543210",
  "address": "Ward 4",
  "password": "Use-a-private-password"
}
```

Passwords are bcrypt-hashed. Reset tokens are random, stored as SHA-256 hashes,
single use, expire after 30 minutes, and invalidate existing sessions when
successfully used. Configure SMTP to deliver reset links; local development
without SMTP returns a development-only reset URL and logs it to the API
terminal. Production never returns the token in the API response.

## Complaints

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/complaints` | Citizen | Submit a complaint and optional image |
| GET | `/complaints/overview` | Citizen | Get totals for the signed-in resident dashboard |
| GET | `/complaints/mine` | Citizen | Search/filter owned reports; cursor pagination |
| GET | `/complaints/community` | Citizen | Browse other residents' active reports |
| GET | `/complaints/:id` | Owner | Read an editable complaint |
| PATCH | `/complaints/:id` | Owner | Edit an unreviewed complaint |
| DELETE | `/complaints/:id` | Owner | Withdraw an unreviewed complaint |
| POST | `/complaints/:id/vote` | Citizen | Support a report once |
| DELETE | `/complaints/:id/vote` | Citizen | Remove your support |

All complaint endpoints above require an authenticated citizen account.
Citizens may create, edit, and withdraw only their own reports; edit and
withdraw operations are rejected after staff review starts. Status, department,
priority, staff remarks, and administrative archiving are available only
through the role-protected `/admin/*` endpoints.

Create form fields: `title`, `category`, `priority`, `location`, `description`,
and optional `image` (JPEG, PNG or WEBP, up to 5 MB). Potential duplicates are
identified by similar titles at the same location and category. The API returns
HTTP 409 with safe report summaries; the resident may review these and explicitly
confirm a genuinely separate issue with `confirmDuplicate=true`.

Residents can edit or withdraw only `Pending` reports before staff review starts.
The history, votes and uploaded image are cleaned up when a report is withdrawn.
Report history is embedded and bounded to the latest 50 events; votes are stored
as a separate collection with one unique record per voter and report.

Active lifecycle:

```text
Pending -> In Review -> In Progress -> Resolved -> Closed
     \          \             \           \
      Rejected   Pending       Rejected    In Progress (reopen)
```

Staff can move a report along the defined transitions; an invalid transition
returns HTTP 409. `Submitted` and `Rejected` remain supported for records created
by older application versions. Closed and rejected reports are not listed in the
community voting feed.

Example `GET /complaints/mine` response:

```json
{
  "complaints": [
    {
      "_id": "66c000000000000000000001",
      "title": "Pothole near the park",
      "category": "Road Damage",
      "priority": "High",
      "location": "Ward 4",
      "status": "In Progress",
      "statusHistory": [
        {
          "status": "In Progress",
          "message": "Repair work has been scheduled.",
          "updatedBy": { "name": "Portal Administrator" },
          "updatedAt": "2026-10-14T12:30:00.000Z"
        }
      ]
    }
  ],
  "nextCursor": null
}
```

## Administration

All `/admin/*` endpoints require a signed-in account whose database role is
`admin`. Public registration always creates citizens. Use `npm run seed:admin`
from `server/` to promote an existing account or create the first admin with
`ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_MOBILE`, and `ADMIN_PASSWORD`; see the
README's Admin account section.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/overview` | Status totals, six-month complaint/user series, category totals |
| GET | `/admin/dashboard` | Alias for dashboard totals and analytics |
| GET | `/admin/complaints` | Search, filter, and cursor-page active complaints |
| GET | `/admin/complaints?includeDeleted=true` | Browse archived complaints |
| GET | `/admin/complaints/:id` | View report, resident, and recent audit history |
| GET | `/admin/complaints/:id/history?page=1` | Page through complete complaint audit history |
| PUT/PATCH | `/admin/complaints/:id/status` | Update status, resident response, priority, and department |
| PATCH | `/admin/complaints/:id/assignment` | Assign a complaint to a department |
| DELETE | `/admin/complaints/:id` | Soft-delete (archive) a report; retain its evidence and audit trail |
| GET | `/admin/users` | Search and page through citizen accounts |
| GET | `/admin/users/:id` | View a resident profile and their complaints |
| PATCH | `/admin/users/:id/suspension` | Suspend or restore a citizen account |
| PUT | `/admin/users/:id/suspend` | Suspend a citizen account |
| PUT | `/admin/users/:id/activate` | Activate a citizen account |
| DELETE | `/admin/users/:id` | Soft-delete the account while retaining related complaint records |

Departments default from the complaint category: Road Damage to Road
Department, Water Supply to Water Department, Electricity Issue to Electricity
Department, Garbage Collection to Sanitation Department. Admins can reassign
any active complaint to Road, Water, Electricity, Sanitation, Drainage, Street
Lighting, Telecommunications, or General Services.

Update body example:

```json
{
  "status": "Resolved",
  "priority": "High",
  "department": "Road Department",
  "adminResponse": "The road repair team has completed the work."
}
```

Complaint action history is stored as separate `ComplaintHistory` documents,
with an indexed complaint reference, actor, action, values, and timestamp. The
embedded status history remains a bounded recent summary for resident pages.
Admin deletion archives complaints (`deletedAt`/`deletedBy`) rather than
removing them; archived records are hidden from resident feeds and dashboard
totals but remain available to admins. Citizen account deletion is likewise
soft and preserves the account reference for complaint/audit history. User and
admin identities share the `User` collection with role-based access, avoiding a
second credentials store.

## Notifications and live updates

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications` | Citizen/admin | Most recent 30 personal notifications and unread count |
| PATCH | `/notifications/:id/read` | Owner | Mark one notification as read |
| GET | `/events` | Citizen/admin | Authenticated Server-Sent Events stream |

Notification documents expire after 90 days. SMTP-configured deployments email
residents when staff changes a complaint's status or sends a response. Delivery
failures are logged; the in-app notification and complaint update remain
available. The event bus is local to one Node process, so multi-instance
deployments need shared pub/sub and shared rate-limit storage.

## Error format

```json
{ "message": "A complaint cannot move from Pending to Closed." }
```

Validation errors use 400, missing records 404, unauthenticated requests 401,
forbidden roles/suspensions 403, duplicate account/vote conflicts 409, image
payload limits 413, and unexpected server errors 500. Private account data,
password hashes, reset hashes and voting identities are never included in the
community feed.
