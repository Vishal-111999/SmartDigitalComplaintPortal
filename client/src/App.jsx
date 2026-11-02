import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { API_ORIGIN, API_URL, apiRequest } from "./api";
import "./App.css";

const complaintStatuses = ["Pending", "In Review", "In Progress", "Resolved", "Closed", "Submitted", "Rejected"];
const complaintCategories = [
  "Road Damage", "Water Supply", "Electricity Issue", "Garbage Collection",
  "Drainage Problem", "Street Light Issue", "Internet Issue", "Other",
];
const legacyComplaintCategories = [
  "Road Problems", "Electricity", "Garbage Issue", "Street Light", "Other Issues",
];
const allComplaintCategories = [...complaintCategories, ...legacyComplaintCategories];

function NotificationCenter({ role }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  function updatePopoverPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const maxHeight = Math.min(440, window.innerHeight - 32);
    const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16));
    let top = rect.bottom + 8;
    if (top + maxHeight > window.innerHeight - 16) {
      top = Math.max(16, rect.top - maxHeight - 8);
    }
    setPopoverPosition({ top, left });
  }

  useEffect(() => {
    let active = true;
    apiRequest("/notifications")
      .then((result) => {
        if (active) {
          setNotifications(result.notifications);
          setUnreadCount(result.unreadCount);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    function refresh() { setReloadKey((key) => key + 1); }
    window.addEventListener("complaint:updated", refresh);
    return () => window.removeEventListener("complaint:updated", refresh);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    updatePopoverPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  async function markRead(notification) {
    if (notification.readAt) return;
    try {
      await apiRequest(`/notifications/${notification._id}/read`, { method: "PATCH" });
      setNotifications((current) => current.map((item) => (
        item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <>
      <div className="notification-menu">
        <button
          ref={triggerRef}
          className="notification-trigger"
          type="button"
          aria-label={`Notifications, ${unreadCount} unread`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => {
            if (!isOpen) updatePopoverPosition();
            setIsOpen((open) => !open);
          }}
        >
          <svg className="notification-bell" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
          <span className="notification-label">Notifications</span>
          {unreadCount > 0 && (
            <span className="notification-count" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>
      {isOpen && popoverPosition && createPortal(
        <div
          className="notification-popover"
          ref={popoverRef}
          role="dialog"
          aria-label="Recent notifications"
          style={popoverPosition}
        >
          <strong>Recent notifications</strong>
          {error && <p className="message error">{error}</p>}
          {notifications.length === 0 && !error && <p className="notification-empty">You’re all caught up.</p>}
          {notifications.map((notification) => (
            <Link
              className={`notification-item${notification.readAt ? "" : " notification-unread"}`}
              key={notification._id}
              to={role === "admin" ? "/admin" : "/my-complaints"}
              onClick={() => {
                setIsOpen(false);
                markRead(notification);
              }}
            >
              <span className="notification-message">{notification.message}</span>
              <time dateTime={notification.createdAt}>
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
                  .format(new Date(notification.createdAt))}
              </time>
            </Link>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function Header({ user, onLogout, logoutBusy, liveStatus }) {
  return (
    <header className="topbar">
      <div className="container navbar">
        <Link className="logo" to="/">Smart Digital Complaint Portal</Link>
        <nav className="nav-links" aria-label="Main navigation">
          <Link to="/">Home</Link>
          {user?.role === "admin" ? (
            <>
              <Link to="/admin">Complaints</Link>
              <Link to="/admin/analytics">Analytics</Link>
              <Link to="/admin/users">Residents</Link>
              <NotificationCenter role={user.role} />
              <span className={`live-status live-status-${liveStatus}`} role="status">
                <span className="live-indicator" aria-hidden="true" />
                {liveStatus === "connected" ? "Live updates" : "Reconnecting..."}
              </span>
              <button className="nav-button logout-button" type="button" onClick={onLogout} disabled={logoutBusy}>
                {logoutBusy ? "Logging out..." : "Logout"}
              </button>
            </>
          ) : user ? (
            <>
              <Link to="/complaint">Raise Complaint</Link>
              <Link to="/my-complaints">My Complaints</Link>
              <Link to="/community">Community</Link>
              <Link to="/profile">Profile</Link>
              <NotificationCenter role={user.role} />
              <span className={`live-status live-status-${liveStatus}`} role="status">
                <span className="live-indicator" aria-hidden="true" />
                {liveStatus === "connected" ? "Live updates" : "Reconnecting..."}
              </span>
              <button className="nav-button logout-button" type="button" onClick={onLogout} disabled={logoutBusy}>
                {logoutBusy ? "Logging out..." : "Logout"}
              </button>
            </>
          ) : (
            <>
              <Link to="/register">Register</Link>
              <Link to="/login">Login</Link>
              <Link to="/admin/login">Admin login</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function HomePage({ user }) {
  return (
    <>
      <main className="container hero">
        <section className="hero-grid">
          <div>
            <p className="eyebrow">A better way to improve your community</p>
            <h1>Raise complaints. Track progress. Make a difference.</h1>
            <p className="hero-copy">
              Report civic issues, share the location and evidence, and follow
              each complaint from submission to resolution.
            </p>
            <div className="button-row">
              <Link className="btn btn-primary" to={user?.role === "admin" ? "/admin" : user ? "/complaint" : "/register"}>
                {user?.role === "admin" ? "Manage Complaints" : user ? "Raise a Complaint" : "Get Started"}
              </Link>
              <Link className="btn btn-secondary" to={user?.role === "admin" ? "/admin/users" : user ? "/my-complaints" : "/login"}>
                {user?.role === "admin" ? "Manage Residents" : "Track Complaints"}
              </Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span>📣</span>
            <strong>Your voice</strong>
            <span className="art-arrow">→</span>
            <strong>Real action</strong>
            <span>🏙️</span>
          </div>
        </section>

        <section className="stats" aria-label="Portal features">
          <article className="stat-box"><strong>Easy</strong><span>Submit an issue online</span></article>
          <article className="stat-box"><strong>Transparent</strong><span>Follow complaint progress</span></article>
          <article className="stat-box"><strong>Connected</strong><span>Help your local community</span></article>
        </section>
      </main>

      <section className="section">
        <div className="container">
          <h2 className="section-title">What can you report?</h2>
          <div className="categories">
            {[
              ["🚧", "Road Damage"],
              ["💧", "Water Supply"],
              ["⚡", "Electricity Issue"],
              ["🗑️", "Garbage Collection"],
              ["🕳️", "Drainage Problem"],
              ["💡", "Street Light Issue"],
              ["🌐", "Internet Issue"],
              ["📍", "Other"],
            ].map(([icon, title]) => (
              <article className="card" key={title}>
                <span className="emoji" aria-hidden="true">{icon}</span>
                <h3>{title}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function ComplaintActivity({ history }) {
  if (!history?.length) return null;

  return (
    <details className="activity-history">
      <summary>Activity history ({history.length})</summary>
      <ol>
        {[...history].reverse().map((entry, index) => (
          <li key={`${entry.updatedAt}-${entry.status}-${index}`}>
            <div className="activity-heading">
              <strong>{entry.status}</strong>
              <time dateTime={entry.updatedAt}>
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
                  .format(new Date(entry.updatedAt))}
              </time>
            </div>
            <span className="activity-author">
              {entry.status === "Submitted" ? "Submitted by" : "Updated by"}{" "}
              {entry.updatedBy?.name || "the complaint team"}
            </span>
            {entry.message && <p>{entry.message}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function AdminResponse({ complaint }) {
  const history = [...(complaint.statusHistory || [])].reverse();
  const historicalResponse = history.find((entry) => {
    const message = entry.message?.trim();
    return message &&
      message !== "Complaint submitted." &&
      message !== "Complaint details updated by the resident." &&
      !message.startsWith("Status changed to ") &&
      !message.startsWith("Assigned to ") &&
      !message.startsWith("Priority changed to ");
  });
  const message = complaint.adminResponse?.trim() || historicalResponse?.message?.trim();
  if (!message) return null;
  const responseActivity = history.find((entry) => entry.message?.trim() === message);
  const responseTimestamp = responseActivity?.updatedAt;

  return (
    <section className="admin-response" aria-label="Response from the complaint team">
      <div className="admin-response-heading">
        <strong>Response from the complaint team</strong>
        {responseTimestamp && (
          <time dateTime={responseTimestamp}>
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
              .format(new Date(responseTimestamp))}
          </time>
        )}
      </div>
      <p>{message}</p>
      {responseActivity?.updatedBy?.name && <small className="admin-response-author">Reply from {responseActivity.updatedBy.name}</small>}
      <small>Visible only to you and the complaint team.</small>
    </section>
  );
}

function AuthPage({ mode, onAuthenticated }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    address: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? form
        : { email: form.email, password: form.password };
      const { user } = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onAuthenticated(user);
      navigate("/");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="form-panel">
        <p className="eyebrow">{isRegister ? "Join the community" : "Welcome back"}</p>
        <h1>{isRegister ? "Create your account" : "Login"}</h1>
        <p className="form-intro">
          {isRegister
            ? "Create an account to submit and track local complaints."
            : "Sign in to manage and follow your complaints."}
        </p>
        <form onSubmit={submit}>
          {isRegister && (
            <>
              <Field label="Full name" name="name" value={form.name} onChange={updateField} required maxLength={100} />
              <Field label="Mobile number" name="mobile" type="tel" value={form.mobile} onChange={updateField} required pattern="[0-9]{10}" maxLength={10} hint="Enter 10 digits." />
              <Field label="Address (optional)" name="address" value={form.address} onChange={updateField} maxLength={500} />
            </>
          )}
          <Field label="Email address" name="email" type="email" value={form.email} onChange={updateField} required maxLength={254} />
          <Field label="Password" name="password" type="password" value={form.password} onChange={updateField} autoComplete={isRegister ? "new-password" : "current-password"} required minLength={8} maxLength={72} hint={isRegister ? "Use at least 8 characters." : undefined} />
          {error && <p className="message error" role="alert">{error}</p>}
          <button className="btn btn-primary submit-button" type="submit" disabled={busy}>
            {busy ? "Please wait..." : isRegister ? "Create account" : "Login"}
          </button>
        </form>
        <p className="form-footer">
          {isRegister ? "Already registered? " : "New here? "}
          <Link to={isRegister ? "/login" : "/register"}>
            {isRegister ? "Login" : "Create an account"}
          </Link>
        </p>
        {!isRegister && <p className="form-footer"><Link to="/forgot-password">Forgot your password?</Link></p>}
      </section>
    </main>
  );
}

function AdminLoginPage({ onAuthenticated }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await apiRequest("/admin/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (user.role !== "admin") {
        throw new Error("This account does not have administrator access.");
      }
      onAuthenticated(user);
      navigate("/admin", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="form-panel">
        <p className="eyebrow">Staff access</p>
        <h1>Administrator login</h1>
        <p className="form-intro">Sign in with an administrator account to manage complaints and residents. Admin accounts are provisioned securely by the system owner; public registration is for residents only. Ask the portal owner to run <code>npm run seed:admin</code> if you need admin access.</p>
        <form onSubmit={submit}>
          <Field label="Administrator email" name="email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required maxLength={254} autoComplete="username" />
          <Field label="Password" name="password" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required maxLength={72} autoComplete="current-password" />
          {error && <p className="message error" role="alert">{error}</p>}
          <button className="btn btn-primary submit-button" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in to admin panel"}</button>
        </form>
        <p className="form-footer"><Link to="/login">Resident login</Link></p>
      </section>
    </main>
  );
}

function PasswordResetPage({ reset = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (reset) {
        const token = new URLSearchParams(location.search).get("token");
        const result = await apiRequest("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        setMessage(result.message);
        window.setTimeout(() => navigate("/login"), 1200);
      } else {
        const result = await apiRequest("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setMessage(result.message);
        setResetUrl(result.developmentResetUrl || "");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="form-panel">
        <p className="eyebrow">Account security</p>
        <h1>{reset ? "Choose a new password" : "Reset your password"}</h1>
        <p className="form-intro">
          {reset ? "Reset links expire after 30 minutes and can only be used once." : "We’ll send a secure, one-time reset link if an account matches that email."}
        </p>
        <form onSubmit={submit}>
          {reset
            ? <Field label="New password" name="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" hint="Use at least 8 characters." />
            : <Field label="Email address" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />}
          {error && <p className="message error" role="alert">{error}</p>}
          {message && <p className="message success" role="status">{message}</p>}
          {resetUrl && <p className="message success">Development reset link: <a href={resetUrl}>Open password reset</a></p>}
          <button className="btn btn-primary submit-button" type="submit" disabled={busy}>
            {busy ? "Please wait..." : reset ? "Reset password" : "Send reset link"}
          </button>
        </form>
        <p className="form-footer"><Link to="/login">Back to login</Link></p>
      </section>
    </main>
  );
}

function ProfilePage({ user, onUserUpdated }) {
  const [form, setForm] = useState({
    name: user.name || "",
    mobile: user.mobile || "",
    address: user.address || "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      onUserUpdated(result.user);
      setNotice("Your profile has been updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordNotice("");
    try {
      const result = await apiRequest("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordNotice(result.message);
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="form-panel">
        <p className="eyebrow">Your account</p>
        <h1>Profile settings</h1>
        <p className="form-intro">{user.email} · {user.role === "admin" ? "Administrator" : "Resident"}</p>
        <form onSubmit={submit}>
          <Field label="Full name" name="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required maxLength={100} />
          <Field label="Mobile number" name="mobile" type="tel" value={form.mobile} onChange={(event) => setForm((current) => ({ ...current, mobile: event.target.value }))} required pattern="[0-9]{10}" maxLength={10} />
          <Field label="Address" name="address" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} maxLength={500} />
          {error && <p className="message error" role="alert">{error}</p>}
          {notice && <p className="message success" role="status">{notice}</p>}
          <button className="btn btn-primary submit-button" type="submit" disabled={busy}>{busy ? "Saving..." : "Save profile"}</button>
        </form>
        <hr className="profile-divider" />
        <h2>Change password</h2>
        <form onSubmit={changePassword}>
          <Field label="Current password" name="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
          <Field label="New password" name="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" hint="Use at least 8 characters." />
          {passwordError && <p className="message error" role="alert">{passwordError}</p>}
          {passwordNotice && <p className="message success" role="status">{passwordNotice}</p>}
          <button className="btn btn-secondary submit-button" type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating..." : "Change password"}</button>
        </form>
      </section>
    </main>
  );
}

function Field({ label, name, type = "text", value, onChange, required, pattern, minLength, maxLength, hint, autoComplete = name }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={name === "mobile" ? "numeric" : undefined}
        value={value}
        onChange={onChange}
        required={required}
        pattern={pattern}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete || ({ mobile: "tel", address: "street-address" })[name] || name}
      />
      {hint && <small>{hint}</small>}
    </div>
  );
}

function ComplaintPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [possibleDuplicates, setPossibleDuplicates] = useState([]);
  const formRef = useRef(null);
  const confirmDuplicateRef = useRef(false);
  const [draft, setDraft] = useState({
    title: "",
    category: "",
    priority: "Medium",
    location: "",
    description: "",
  });

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    apiRequest(`/complaints/${id}`)
      .then(({ complaint }) => {
        if (active) {
          setDraft({
            title: complaint.title,
            category: complaint.category,
            priority: complaint.priority,
            location: complaint.location,
            description: complaint.description,
          });
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  function updateDraft(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const image = formData.get("image");
    if (image instanceof File && image.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    if (confirmDuplicateRef.current) {
      formData.set("confirmDuplicate", "true");
      confirmDuplicateRef.current = false;
    }
    setPossibleDuplicates([]);
    setBusy(true);
    try {
      await apiRequest(editing ? `/complaints/${id}` : "/complaints", {
        method: editing ? "PATCH" : "POST",
        body: formData,
      });
      navigate("/my-complaints", {
        state: { notice: editing ? "Complaint updated successfully." : "Complaint submitted successfully." },
      });
    } catch (requestError) {
      setError(requestError.message);
      setPossibleDuplicates(requestError.data?.possibleDuplicates || []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="form-panel wide-panel">
        <p className="eyebrow">{editing ? "Update your report" : "Tell us what needs attention"}</p>
        <h1>{editing ? "Edit Complaint" : "Raise a Complaint"}</h1>
        {loading && <p className="loading-message" role="status">Loading complaint...</p>}
        <form ref={formRef} onSubmit={submit}>
          <div className="form-grid">
            <Field label="Complaint title" name="title" value={draft.title} onChange={updateDraft} required maxLength={120} />
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" value={draft.category} onChange={updateDraft} required>
                <option value="" disabled>Select a category</option>
                {[...complaintCategories, ...(legacyComplaintCategories.includes(draft.category) ? [draft.category] : [])]
                  .map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" name="priority" value={draft.priority} onChange={updateDraft} required>
                <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
              </select>
            </div>
            <Field label="Location" name="location" value={draft.location} onChange={updateDraft} required maxLength={250} />
            <div className="field full-width">
              <label htmlFor="description">Complaint details</label>
              <textarea id="description" name="description" value={draft.description} onChange={updateDraft} required maxLength={5000} rows="5" />
            </div>
            <div className="field full-width">
              <label htmlFor="image">Evidence image (optional)</label>
              <input
                id="image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={() => setError("")}
              />
              <small>JPG, PNG or WEBP; maximum 5 MB.</small>
            </div>
          </div>
          {error && <p className="message error" role="alert">{error}</p>}
          {possibleDuplicates.length > 0 && (
            <section className="duplicate-review" aria-label="Possible duplicate complaints">
              <strong>Similar active reports</strong>
              <p>These reports appear to describe the same issue and location. Review them first, or confirm that your report describes a separate problem.</p>
              {possibleDuplicates.map((item) => (
                <div className="duplicate-item" key={item._id}>
                  <span>{item.title}</span><small>{item.category} · {item.status} · {item.location}</small>
                </div>
              ))}
              <button className="btn btn-secondary" type="button" onClick={() => {
                confirmDuplicateRef.current = true;
                formRef.current?.requestSubmit();
              }}>
                My report is a separate issue — submit anyway
              </button>
            </section>
          )}
          <button className="btn btn-primary submit-button" type="submit" disabled={busy || loading || Boolean(error && editing)}>
            {busy ? "Saving..." : editing ? "Save changes" : "Submit Complaint"}
          </button>
        </form>
      </section>
    </main>
  );
}

function CommunityPage() {
  const [complaints, setComplaints] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [voteError, setVoteError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (activeSearch) query.set("search", activeSearch);
    if (statusFilter) query.set("status", statusFilter);
    if (categoryFilter) query.set("category", categoryFilter);
    apiRequest(`/complaints/community${query.size ? `?${query}` : ""}`)
      .then(({ complaints: items, nextCursor: cursor }) => {
        if (active) {
          setComplaints(items);
          setNextCursor(cursor);
          setError("");
        }
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeSearch, statusFilter, categoryFilter, reloadKey]);

  useEffect(() => {
    function refresh() { setReloadKey((key) => key + 1); }
    window.addEventListener("complaint:updated", refresh);
    return () => window.removeEventListener("complaint:updated", refresh);
  }, []);

  async function vote(complaint) {
    setBusyId(complaint._id);
    setVoteError("");
    try {
      const result = await apiRequest(`/complaints/${complaint._id}/vote`, {
        method: complaint.votedByMe ? "DELETE" : "POST",
      });
      setComplaints((current) => current.map((item) => (
        item._id === complaint._id ? { ...item, ...result } : item
      )));
    } catch (requestError) {
      setVoteError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ cursor: nextCursor });
      if (activeSearch) query.set("search", activeSearch);
      if (statusFilter) query.set("status", statusFilter);
      if (categoryFilter) query.set("category", categoryFilter);
      const result = await apiRequest(`/complaints/community?${query}`);
      setComplaints((current) => [...current, ...result.complaints]);
      setNextCursor(result.nextCursor);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="container listing-page">
      <p className="eyebrow">Community reports</p>
      <h1>Support local issues</h1>
      <p className="form-intro">Find reports from other residents and add your support. Your vote is private.</p>
      <div className="admin-toolbar complaint-toolbar">
        <form className="admin-search" onSubmit={(event) => {
          event.preventDefault();
          setComplaints([]);
          setNextCursor(null);
          setLoading(true);
          setActiveSearch(searchText.trim());
        }}>
          <label className="field" htmlFor="community-search">Search reports
            <input id="community-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} maxLength={100} placeholder="Title, details, location or category" />
          </label>
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
        <label className="field admin-filter" htmlFor="community-status">Filter by status
          <select id="community-status" value={statusFilter} onChange={(event) => {
            setComplaints([]);
            setNextCursor(null);
            setLoading(true);
            setStatusFilter(event.target.value);
          }}>
            <option value="">All active reports</option>
            {["Pending", "In Review", "In Progress", "Resolved"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="field admin-filter" htmlFor="community-category">Filter by category
          <select id="community-category" value={categoryFilter} onChange={(event) => {
            setComplaints([]);
            setNextCursor(null);
            setLoading(true);
            setCategoryFilter(event.target.value);
          }}>
            <option value="">All categories</option>
            {allComplaintCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
      </div>
      {voteError && <p className="message error" role="alert">{voteError}</p>}
      {loading && <p className="loading-message" role="status">Loading community reports...</p>}
      {error && <div className="error-state" role="alert"><p>{error}</p><button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey((key) => key + 1); }}>Try again</button></div>}
      {!loading && !error && complaints.length === 0 && <section className="empty-state"><h2>No matching community reports</h2><p>Try another search or check back when more residents have reported an issue.</p></section>}
      <div className="complaint-list">
        {complaints.map((complaint) => (
          <article className="complaint-card" key={complaint._id}>
            <div className="complaint-heading">
              <div><span className="category-label">{complaint.category}</span><h2>{complaint.title}</h2></div>
              <span className={`status status-${complaint.status.toLowerCase().replaceAll(" ", "-")}`}>{complaint.status}</span>
            </div>
            <p>{complaint.description}</p>
            <div className="complaint-meta">
              <span>📍 {complaint.location}</span>
              <span>Priority: {complaint.priority}</span>
              <time dateTime={complaint.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(complaint.createdAt))}</time>
            </div>
            <div className="community-vote">
              <span>{complaint.votes} {complaint.votes === 1 ? "resident supports" : "residents support"} this report</span>
              <button className={complaint.votedByMe ? "btn btn-secondary" : "btn btn-primary"} type="button" onClick={() => vote(complaint)} disabled={busyId === complaint._id}>
                {busyId === complaint._id ? "Saving..." : complaint.votedByMe ? "Remove support" : "Support this report"}
              </button>
            </div>
            {complaint.imagePath && <img className="complaint-image" src={`${API_ORIGIN}${complaint.imagePath}`} alt="Community complaint evidence" />}
          </article>
        ))}
      </div>
      {nextCursor && <button className="btn btn-secondary" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more reports"}</button>}
    </main>
  );
}

function MyComplaintsPage() {
  const location = useLocation();
  const [complaints, setComplaints] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/complaints/overview")
      .then((result) => { if (active) { setOverview(result); setOverviewError(""); } })
      .catch((requestError) => { if (active) setOverviewError(requestError.message); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (statusFilter) query.set("status", statusFilter);
    if (categoryFilter) query.set("category", categoryFilter);
    if (activeSearch) query.set("search", activeSearch);
    apiRequest(`/complaints/mine${query.size ? `?${query}` : ""}`)
      .then(({ complaints: items, nextCursor: cursor }) => {
        if (active) {
          setComplaints(items);
          setNextCursor(cursor);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, statusFilter, categoryFilter, activeSearch]);

  useEffect(() => {
    let refreshTimer;
    function handleComplaintUpdate() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        setLoading(true);
        setError("");
        setComplaints([]);
        setNextCursor(null);
        setReloadKey((key) => key + 1);
      }, 200);
    }
    window.addEventListener("complaint:updated", handleComplaintUpdate);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener("complaint:updated", handleComplaintUpdate);
    };
  }, []);

  function retryLoading() {
    setLoading(true);
    setError("");
    setComplaints([]);
    setNextCursor(null);
    setReloadKey((key) => key + 1);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const query = new URLSearchParams({ cursor: nextCursor });
      if (statusFilter) query.set("status", statusFilter);
      if (categoryFilter) query.set("category", categoryFilter);
      if (activeSearch) query.set("search", activeSearch);
      const { complaints: items, nextCursor: cursor } = await apiRequest(`/complaints/mine?${query}`);
      setComplaints((current) => [...current, ...items]);
      setNextCursor(cursor);
    } catch (requestError) {
      setMoreError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="container listing-page">
      <p className="eyebrow">Your reports</p>
      <h1>My Complaints</h1>
      {overviewError && <p className="message error" role="alert">Dashboard summary: {overviewError}</p>}
      <section className="stats resident-stats" aria-label="Your complaint summary">
        {[
          ["Total reports", overview?.total],
          ["Active", overview?.active],
          ["In progress", overview?.statusCounts?.["In Progress"]],
          ["Resolved", overview?.resolved],
        ].map(([label, count]) => (
          <article className="stat-box" key={label}>
            <strong aria-live="polite">{count ?? "—"}</strong><span>{label}</span>
          </article>
        ))}
      </section>
      <div className="admin-toolbar complaint-toolbar">
        <form className="admin-search" onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setComplaints([]);
          setNextCursor(null);
          setActiveSearch(searchText.trim());
        }}>
          <label className="field" htmlFor="my-complaint-search">
            Search your reports
            <input
              id="my-complaint-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              maxLength={100}
              placeholder="Title, details, location or category"
            />
          </label>
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
        <label className="field admin-filter" htmlFor="my-status-filter">
          Filter by status
          <select id="my-status-filter" value={statusFilter} onChange={(event) => {
            setLoading(true);
            setComplaints([]);
            setNextCursor(null);
            setStatusFilter(event.target.value);
          }}>
            <option value="">All statuses</option>
            {complaintStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="field admin-filter" htmlFor="my-category-filter">
          Filter by category
          <select id="my-category-filter" value={categoryFilter} onChange={(event) => {
            setLoading(true);
            setComplaints([]);
            setNextCursor(null);
            setCategoryFilter(event.target.value);
          }}>
            <option value="">All categories</option>
            {allComplaintCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
      </div>
      {location.state && location.state.notice && (
        <p className="message success" role="status">{location.state.notice}</p>
      )}
      {loading && <p className="loading-message" role="status">Loading your complaints...</p>}
      {error && (
        <div className="error-state" role="alert">
          <p>{error}</p>
          <button className="btn btn-secondary" type="button" onClick={retryLoading}>
            Try again
          </button>
        </div>
      )}
      {!loading && !error && complaints.length === 0 && (
        <section className="empty-state">
          <span aria-hidden="true">📭</span>
          <h2>No complaints yet</h2>
          <p>When you report an issue, you can track its progress here.</p>
          <Link className="btn btn-primary" to="/complaint">Raise a Complaint</Link>
        </section>
      )}
      <div className="complaint-list">
        {complaints.map((complaint) => (
          <article className="complaint-card" key={complaint._id}>
            <div className="complaint-heading">
              <div><span className="category-label">{complaint.category}</span><h2>{complaint.title}</h2></div>
              <span className={`status status-${complaint.status.toLowerCase().replaceAll(" ", "-")}`}>
                {complaint.status}
              </span>
            </div>
            <p>{complaint.description}</p>
            <AdminResponse complaint={complaint} />
            <ComplaintActivity history={complaint.statusHistory} />
            <div className="complaint-meta">
              <span>📍 {complaint.location}</span>
              <span>Priority: {complaint.priority}</span>
              <time dateTime={complaint.createdAt}>
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
                  .format(new Date(complaint.createdAt))}
              </time>
            </div>
            {(complaint.status === "Pending" || complaint.status === "Submitted") && !complaint.reviewedAt && (
              <div className="admin-actions resident-complaint-actions">
                <Link className="btn btn-secondary" to={`/complaint/${complaint._id}/edit`}>Edit complaint</Link>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Withdraw "${complaint.title}"? This cannot be undone.`)) return;
                    try {
                      await apiRequest(`/complaints/${complaint._id}`, { method: "DELETE" });
                      setComplaints((current) => current.filter((item) => item._id !== complaint._id));
                    } catch (requestError) {
                      setError(requestError.message);
                    }
                  }}
                >
                  Withdraw complaint
                </button>
              </div>
            )}
            {complaint.imagePath && (
              <img className="complaint-image" src={`${API_ORIGIN}${complaint.imagePath}`} alt="Complaint evidence" />
            )}
          </article>
        ))}
      </div>
      {moreError && <p className="message error" role="alert">{moreError}</p>}
      {nextCursor && (
        <button className="btn btn-secondary" type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more complaints"}
        </button>
      )}
    </main>
  );
}

function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");
  const [error, setError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [notice, setNotice] = useState("");
  const [responseDrafts, setResponseDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest("/admin/overview")
      .then((data) => {
        if (active) {
          setOverview(data);
          setOverviewError("");
        }
      })
      .catch((requestError) => {
        if (active) setOverviewError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (statusFilter) query.set("status", statusFilter);
    if (categoryFilter) query.set("category", categoryFilter);
    if (showArchived) query.set("includeDeleted", "true");
    if (activeSearch) query.set("search", activeSearch);

    apiRequest(`/admin/complaints${query.size ? `?${query}` : ""}`)
      .then(({ complaints: items, nextCursor: cursor }) => {
        if (active) {
          setComplaints(items);
          setNextCursor(cursor);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [statusFilter, categoryFilter, activeSearch, showArchived, reloadKey]);

  useEffect(() => {
    let refreshTimer;
    function handleComplaintUpdate() {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        setLoading(true);
        setError("");
        setComplaints([]);
        setNextCursor(null);
        setReloadKey((key) => key + 1);
      }, 200);
    }
    window.addEventListener("complaint:updated", handleComplaintUpdate);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener("complaint:updated", handleComplaintUpdate);
    };
  }, []);

  function changeFilter(event) {
    setLoading(true);
    setError("");
    setComplaints([]);
    setNextCursor(null);
    setStatusFilter(event.target.value);
  }

  function submitSearch(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setComplaints([]);
    setNextCursor(null);
    setActiveSearch(searchText.trim());
  }

  function retryLoading() {
    setLoading(true);
    setError("");
    setComplaints([]);
    setNextCursor(null);
    setReloadKey((key) => key + 1);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ cursor: nextCursor });
      if (statusFilter) query.set("status", statusFilter);
      if (categoryFilter) query.set("category", categoryFilter);
      if (showArchived) query.set("includeDeleted", "true");
      if (activeSearch) query.set("search", activeSearch);
      const { complaints: items, nextCursor: cursor } = await apiRequest(
        `/admin/complaints?${query}`,
      );
      setComplaints((current) => [...current, ...items]);
      setNextCursor(cursor);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function updateStatus(id, status, adminResponse, priority) {
    setUpdatingId(id);
    setUpdateError("");
    setNotice("");
    try {
      const { complaint } = await apiRequest(`/admin/complaints/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(adminResponse === undefined ? {} : { adminResponse }),
          ...(priority === undefined ? {} : { priority }),
        }),
      });
      setComplaints((current) => current.flatMap((item) => {
        if (item._id !== complaint._id) return [item];
        return statusFilter && complaint.status !== statusFilter ? [] : [complaint];
      }));
      setResponseDrafts((current) => ({ ...current, [id]: complaint.adminResponse || "" }));
      setNotice("Complaint status updated.");
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setUpdateError(requestError.message);
    } finally {
      setUpdatingId("");
    }
  }

  async function sendResponse(complaint) {
    const adminResponse = responseDrafts[complaint._id] ?? complaint.adminResponse ?? "";
    if (!adminResponse.trim()) {
      setUpdateError("Enter a response before sending it to the resident.");
      return;
    }
    await updateStatus(complaint._id, complaint.status, adminResponse.trim());
  }

  async function removeComplaint(complaint) {
    if (!window.confirm(`Archive "${complaint.title}"? It will be hidden from residents and retained in the audit records.`)) return;
    setDeletingId(complaint._id);
    setUpdateError("");
    setNotice("");
    try {
      await apiRequest(`/admin/complaints/${complaint._id}`, { method: "DELETE" });
      setComplaints((current) => current.filter((item) => item._id !== complaint._id));
      setNotice("Complaint archived.");
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setUpdateError(requestError.message);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="container listing-page">
      <p className="eyebrow">Administration</p>
      <h1>Manage complaints</h1>
      <p className="form-intro">Review reports and keep residents up to date.</p>

      {overviewError && (
        <p className="message error" role="alert">Dashboard summary: {overviewError}</p>
      )}
      <section className="stats admin-stats" aria-label="Complaint summary">
        {[
          ["Total users", overview?.totalUsers],
          ["Total reports", overview?.total],
          ["Pending", overview?.pending],
          ["In review", overview?.statusCounts?.["In Review"]],
          ["In progress", overview?.statusCounts?.["In Progress"]],
          ["Resolved", overview?.resolved],
          ["Closed", overview?.statusCounts?.Closed],
        ].map(([label, count]) => (
          <article className="stat-box" key={label}>
            <strong aria-live="polite">{count ?? "—"}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      {overview && (
        <section className="analytics-grid" aria-label="Complaint analytics">
          <article className="analytics-card">
            <h2>Reports by month</h2>
            <div className="bar-chart">
              {overview.monthlyComplaints.map(({ month, count }) => {
                const maximum = Math.max(1, ...overview.monthlyComplaints.map((item) => item.count));
                return (
                  <div className="bar-chart-item" key={month}>
                    <span>{count}</span>
                    <div className="bar-chart-track"><span style={{ height: `${Math.max(count ? 10 : 0, (count / maximum) * 100)}%` }} /></div>
                    <small>{month}</small>
                  </div>
                );
              })}
            </div>
          </article>
          <article className="analytics-card">
            <h2>Reports by category</h2>
            {overview.categoryCounts.length === 0 && <p className="loading-message">No reports yet.</p>}
            <div className="category-chart">
              {overview.categoryCounts.map(({ category, count }) => {
                const maximum = Math.max(1, ...overview.categoryCounts.map((item) => item.count));
                return (
                  <div className="category-chart-item" key={category}>
                    <div><span>{category}</span><strong>{count}</strong></div>
                    <span className="category-bar"><span style={{ width: `${(count / maximum) * 100}%` }} /></span>
                  </div>
                );
              })}
            </div>
          </article>
          <article className="analytics-card">
            <h2>Resident registrations</h2>
            <div className="bar-chart">
              {overview.monthlyUsers.map(({ month, count }) => {
                const maximum = Math.max(1, ...overview.monthlyUsers.map((item) => item.count));
                return (
                  <div className="bar-chart-item" key={month}>
                    <span>{count}</span>
                    <div className="bar-chart-track"><span className="user-chart-bar" style={{ height: `${Math.max(count ? 10 : 0, (count / maximum) * 100)}%` }} /></div>
                    <small>{month}</small>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      )}

      <div className="admin-toolbar">
        <form className="admin-search" onSubmit={submitSearch}>
          <label className="field" htmlFor="complaint-search">
            Search reports
            <input
              id="complaint-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              maxLength={100}
              placeholder="Title, details, location or category"
            />
          </label>
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
        <label className="field admin-filter" htmlFor="status-filter">
          Filter by status
          <select
            id="status-filter"
            value={statusFilter}
            onChange={changeFilter}
          >
            <option value="">All statuses</option>
            {complaintStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="field admin-filter" htmlFor="admin-category-filter">
          Filter by category
          <select id="admin-category-filter" value={categoryFilter} onChange={(event) => {
            setLoading(true);
            setError("");
            setComplaints([]);
            setNextCursor(null);
            setCategoryFilter(event.target.value);
          }}>
            <option value="">All categories</option>
            {allComplaintCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="field admin-filter" htmlFor="admin-archive-filter">
          Complaint records
          <select id="admin-archive-filter" value={showArchived ? "archived" : "active"} onChange={(event) => {
            setLoading(true);
            setError("");
            setComplaints([]);
            setNextCursor(null);
            setShowArchived(event.target.value === "archived");
          }}>
            <option value="active">Active complaints</option>
            <option value="archived">Archived complaints</option>
          </select>
        </label>
        {notice && <p className="message success" role="status">{notice}</p>}
      </div>

      {error && (
        <div className="error-state" role="alert">
          <p>{error}</p>
          <button className="btn btn-secondary" type="button" onClick={retryLoading}>
            Try again
          </button>
        </div>
      )}
      {updateError && <p className="message error" role="alert">{updateError}</p>}
      {loading && <p className="loading-message" role="status">Loading complaints...</p>}
      {!loading && !error && complaints.length === 0 && (
        <section className="empty-state">
          <h2>No complaints found</h2>
          <p>
            {showArchived ? "No archived complaints match these filters." : activeSearch || statusFilter
              ? "Try another search or status filter."
              : "New reports will appear here."}
          </p>
        </section>
      )}

      <div className="complaint-list">
        {complaints.map((complaint) => (
          <article className="complaint-card" key={complaint._id}>
            <div className="complaint-heading">
              <div>
                <span className="category-label">{complaint.category}</span>
                <h2><Link to={`/admin/complaints/${complaint._id}`}>{complaint.title}</Link></h2>
              </div>
              <label className="admin-status">
                <span>Status</span>
                <select
                  value={complaint.status}
                  onChange={(event) => updateStatus(complaint._id, event.target.value)}
                  disabled={updatingId === complaint._id || Boolean(complaint.deletedAt)}
                  aria-label={`Status for ${complaint.title}`}
                >
                  {complaintStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className="admin-status">
                <span>Priority</span>
                <select
                  value={complaint.priority}
                  onChange={(event) => updateStatus(complaint._id, complaint.status, undefined, event.target.value)}
                  disabled={updatingId === complaint._id || Boolean(complaint.deletedAt)}
                  aria-label={`Priority for ${complaint.title}`}
                >
                  {["Low", "Medium", "High", "Urgent"].map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </label>
            </div>
            <p>{complaint.description}</p>
            <p className="department-label">Department: {complaint.department || "General Services Department"}</p>
            <ComplaintActivity history={complaint.statusHistory} />
            <label className="field admin-response-field">
              <span>Response to resident</span>
              <textarea
                value={responseDrafts[complaint._id] ?? complaint.adminResponse ?? ""}
                onChange={(event) => setResponseDrafts((current) => ({
                  ...current,
                  [complaint._id]: event.target.value,
                }))}
                maxLength={1000}
                rows={3}
                placeholder="Let the resident know what action was taken."
              />
              <small>Up to 1000 characters. The resident can see this message.</small>
            </label>
            <div className="admin-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => sendResponse(complaint)}
                disabled={updatingId === complaint._id || deletingId === complaint._id}
              >
                {updatingId === complaint._id ? "Sending..." : "Send response"}
              </button>
              {!complaint.deletedAt && (
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => removeComplaint(complaint)}
                  disabled={updatingId === complaint._id || deletingId === complaint._id}
                >
                  {deletingId === complaint._id ? "Archiving..." : "Archive complaint"}
                </button>
              )}
              <Link className="btn btn-secondary" to={`/admin/complaints/${complaint._id}`}>View details</Link>
            </div>
            <div className="complaint-meta">
              <span>📍 {complaint.location}</span>
              <span>Priority: {complaint.priority}</span>
              <span>Reported by: {complaint.createdBy
                ? <Link to={`/admin/users/${complaint.createdBy._id}`}>{complaint.createdBy.name}</Link>
                : "Unknown user"}</span>
              <time dateTime={complaint.createdAt}>
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
                  .format(new Date(complaint.createdAt))}
              </time>
            </div>
            {complaint.imagePath && (
              <img className="complaint-image" src={`${API_ORIGIN}${complaint.imagePath}`} alt="Complaint evidence" />
            )}
          </article>
        ))}
      </div>
      {nextCursor && (
        <button className="btn btn-secondary" type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more complaints"}
        </button>
      )}
    </main>
  );
}

function AdminComplaintDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("");
  const [adminResponse, setAdminResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/complaints/${id}`)
      .then((result) => {
        if (!active) return;
        setComplaint(result.complaint);
        setHistory(result.history);
        setHistoryTotal(result.historyTotal);
        setHistoryPage(1);
        setStatus(result.complaint.status);
        setDepartment(result.complaint.department || "General Services Department");
        setPriority(result.complaint.priority);
        setAdminResponse(result.complaint.adminResponse || "");
        setError("");
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadKey]);

  async function saveUpdates(event) {
    event.preventDefault();
    if (!complaint) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/admin/complaints/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status, department, priority, adminResponse }),
      });
      setNotice("Complaint changes saved and added to the audit history.");
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadOlderHistory() {
    const nextPage = historyPage + 1;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest(`/admin/complaints/${id}/history?page=${nextPage}`);
      setHistory((current) => [...current, ...result.history]);
      setHistoryPage(nextPage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveComplaint() {
    if (!complaint || !window.confirm(`Archive "${complaint.title}"? Its audit history and evidence will be retained.`)) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/admin/complaints/${id}`, { method: "DELETE" });
      navigate("/admin", { replace: true, state: { notice: "Complaint archived." } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || complaint?._id !== id) return <main className="container listing-page"><p className="loading-message" role="status">Loading complaint details...</p></main>;
  if (error && !complaint) return <main className="container listing-page"><div className="error-state" role="alert"><p>{error}</p><button className="btn btn-secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div></main>;
  if (!complaint) return null;

  const archived = Boolean(complaint.deletedAt);
  return (
    <main className="container listing-page">
      <Link className="back-link" to="/admin">← Back to complaints</Link>
      <p className="eyebrow">Complaint case file</p>
      <h1>{complaint.title}</h1>
      {archived && <p className="message error">Archived on {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(complaint.deletedAt))} by {complaint.deletedBy?.name || "an administrator"}.</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      {notice && <p className="message success" role="status">{notice}</p>}
      <section className="admin-detail-grid">
        <article className="complaint-card">
          <div className="complaint-heading">
            <div><span className="category-label">{complaint.category}</span><h2>Report details</h2></div>
            <span className={`status status-${complaint.status.toLowerCase().replaceAll(" ", "-")}`}>{complaint.status}</span>
          </div>
          <p>{complaint.description}</p>
          <div className="complaint-meta">
            <span>Location: {complaint.location}</span>
            <span>Reported: {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(complaint.createdAt))}</span>
            <span>Priority: {complaint.priority}</span>
            <span>Department: {complaint.department || "General Services Department"}</span>
          </div>
          {complaint.imagePath && <img className="complaint-image" src={`${API_ORIGIN}${complaint.imagePath}`} alt="Complaint evidence" />}
          <h2 className="detail-section-heading">Resident</h2>
          {complaint.createdBy ? (
            <p><Link to={`/admin/users/${complaint.createdBy._id}`}>{complaint.createdBy.name}</Link><br />
              <a href={`mailto:${complaint.createdBy.email}`}>{complaint.createdBy.email}</a> · {complaint.createdBy.mobile}</p>
          ) : <p>Resident account unavailable.</p>}
        </article>
        <section className="form-panel admin-detail-panel">
          <h2>Manage case</h2>
          <form onSubmit={saveUpdates}>
            <label className="field">Status
              <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={archived || busy} required>
                {complaintStatuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">Assigned department
              <select value={department} onChange={(event) => setDepartment(event.target.value)} disabled={archived || busy} required>
                {["Road Department", "Water Department", "Electricity Department", "Sanitation Department", "Drainage Department", "Street Lighting Department", "Telecommunications Department", "General Services Department"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value)} disabled={archived || busy}>
                {["Low", "Medium", "High", "Urgent"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">Remark or response to resident
              <textarea value={adminResponse} onChange={(event) => setAdminResponse(event.target.value)} maxLength={1000} rows={5} disabled={archived || busy} placeholder="Record the action taken or update for the resident." />
              <small>Up to 1000 characters. A non-empty update is visible to the resident.</small>
            </label>
            <button className="btn btn-primary submit-button" type="submit" disabled={archived || busy}>{busy ? "Saving..." : "Save case update"}</button>
          </form>
          {!archived && <button className="btn btn-danger submit-button" type="button" onClick={archiveComplaint} disabled={busy}>Archive complaint</button>}
        </section>
      </section>
      <section className="audit-panel">
        <h2>Complete complaint history</h2>
        <ol className="audit-list">
          {[...history].reverse().map((item, index) => (
            <li key={item._id || `${item.action}-${item.createdAt}-${index}`}>
              <div className="activity-heading">
                <strong>{item.action}</strong>
                <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
              </div>
              {item.fromValue && item.toValue && <p>{item.fromValue} → {item.toValue}</p>}
              {item.message && <p>{item.message}</p>}
              <small>By {item.actor?.name || "Resident / system"}</small>
            </li>
          ))}
        </ol>
        {history.length < historyTotal && <button className="btn btn-secondary" type="button" onClick={loadOlderHistory} disabled={busy}>Load older history</button>}
        {history.length === 0 && <p>No history records are available yet.</p>}
      </section>
    </main>
  );
}

function AdminAnalyticsPage() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/admin/overview")
      .then((result) => { if (active) { setOverview(result); setError(""); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <main className="container listing-page"><p className="loading-message" role="status">Loading analytics...</p></main>;
  return (
    <main className="container listing-page">
      <p className="eyebrow">Administration</p>
      <h1>Analytics</h1>
      {error && <p className="message error" role="alert">{error}</p>}
      {overview && <>
        <section className="stats admin-stats" aria-label="Analytics summary">
          {[["Total users", overview.totalUsers], ["Total complaints", overview.total], ["Pending", overview.pending], ["In review", overview.statusCounts["In Review"]], ["In progress", overview.statusCounts["In Progress"]], ["Resolved", overview.resolved], ["Closed", overview.statusCounts.Closed]].map(([label, count]) => <article className="stat-box" key={label}><strong>{count ?? 0}</strong><span>{label}</span></article>)}
        </section>
        <section className="analytics-grid" aria-label="Complaint analytics">
          {[["Complaints by month", overview.monthlyComplaints, false], ["Resident registrations", overview.monthlyUsers, true]].map(([title, rows, users]) => {
            const maximum = Math.max(1, ...rows.map((row) => row.count));
            return <article className="analytics-card" key={title}><h2>{title}</h2><div className="bar-chart">{rows.map(({ month, count }) => <div className="bar-chart-item" key={month}><span>{count}</span><div className="bar-chart-track"><span className={users ? "user-chart-bar" : ""} style={{ height: `${Math.max(count ? 10 : 0, count / maximum * 100)}%` }} /></div><small>{month}</small></div>)}</div></article>;
          })}
          <article className="analytics-card"><h2>Complaints by category</h2>{overview.categoryCounts.length === 0 ? <p>No complaints yet.</p> : <div className="category-chart">{overview.categoryCounts.map(({ category, count }) => { const maximum = Math.max(1, ...overview.categoryCounts.map((row) => row.count)); return <div className="category-chart-item" key={category}><div><span>{category}</span><strong>{count}</strong></div><span className="category-bar"><span style={{ width: `${count / maximum * 100}%` }} /></span></div>; })}</div>}</article>
        </section>
      </>}
    </main>
  );
}

function AdminUserDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/users/${id}`)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadKey]);

  async function setSuspended(suspended) {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest(`/admin/users/${id}/${suspended ? "suspend" : "activate"}`, { method: "PUT" });
      setData((current) => ({ ...current, user: result.user }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!data || !window.confirm(`Delete ${data.user.name}'s account? Their complaint and audit records will be retained.`)) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/admin/users/${id}`, { method: "DELETE" });
      navigate("/admin/users", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  async function loadMoreComplaints() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const nextPage = data.page + 1;
      const result = await apiRequest(`/admin/users/${id}?page=${nextPage}`);
      setData((current) => ({
        ...current,
        complaints: [...current.complaints, ...result.complaints],
        page: result.page,
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container listing-page">
      <Link className="back-link" to="/admin/users">← Back to residents</Link>
      {error && <p className="message error" role="alert">{error} <button className="btn btn-secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></p>}
      {loading || (data && data.user._id !== id) ? <p className="loading-message" role="status">Loading resident profile...</p> : !data ? null : <>
        <p className="eyebrow">Resident profile</p>
        <h1>{data.user.name}</h1>
        {data.user.deletedAt && <p className="message error">Account deleted on {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.user.deletedAt))} by {data.user.deletedBy?.name || "an administrator"}.</p>}
        <section className="user-card user-detail-card">
          <div><p><a href={`mailto:${data.user.email}`}>{data.user.email}</a></p><p>{data.user.mobile}</p><p>{data.user.address || "No address provided"}</p><small>Joined {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(data.user.createdAt))}</small></div>
          <div className="user-status-actions"><span className={`account-status${data.user.isSuspended || data.user.deletedAt ? " account-suspended" : ""}`}>{data.user.deletedAt ? "Deleted" : data.user.isSuspended ? "Suspended" : "Active"}</span>{!data.user.deletedAt && <><button className="btn btn-secondary" type="button" onClick={() => setSuspended(!data.user.isSuspended)} disabled={busy}>{data.user.isSuspended ? "Activate account" : "Suspend account"}</button><button className="btn btn-danger" type="button" onClick={deleteUser} disabled={busy}>Delete account</button></>}</div>
        </section>
        <h2 className="detail-section-heading">Complaints ({data.complaintTotal})</h2>
        {data.complaints.length === 0 ? <section className="empty-state"><p>This resident has no complaints.</p></section> : <div className="complaint-list">{data.complaints.map((item) => <article className="complaint-card" key={item._id}><div className="complaint-heading"><div><span className="category-label">{item.category}</span><h2><Link to={`/admin/complaints/${item._id}`}>{item.title}</Link></h2></div><span className={`status status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.deletedAt ? "Archived" : item.status}</span></div><div className="complaint-meta"><span>{item.department}</span><span>Priority: {item.priority}</span><span>{item.location}</span></div></article>)}</div>}
        {data.complaints.length < data.complaintTotal && <button className="btn btn-secondary" type="button" onClick={loadMoreComplaints} disabled={busy}>{busy ? "Loading complaints..." : "Load older complaints"}</button>}
      </>}
    </main>
  );
}

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: String(page) });
    if (activeSearch) query.set("search", activeSearch);
    apiRequest(`/admin/users?${query}`)
      .then((result) => {
        if (active) {
          setUsers(result.users);
          setTotal(result.total);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, activeSearch, reloadKey]);

  async function toggleSuspension(user) {
    setBusyId(user._id);
    setError("");
    try {
      const { user: updated } = await apiRequest(`/admin/users/${user._id}/suspension`, {
        method: "PATCH",
        body: JSON.stringify({ suspended: !user.isSuspended }),
      });
      setUsers((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="container listing-page">
      <p className="eyebrow">Administration</p>
      <h1>Resident accounts</h1>
      <p className="form-intro">Review registrations and manage access to the complaint portal.</p>
      <form className="admin-search user-search" onSubmit={(event) => {
        event.preventDefault();
        setPage(1);
        setLoading(true);
        setActiveSearch(searchText.trim());
      }}>
        <label className="field" htmlFor="resident-search">
          Search residents
          <input id="resident-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} maxLength={100} placeholder="Name, email or mobile number" />
        </label>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <p className="user-total">{total} registered residents</p>
      {error && <div className="error-state" role="alert"><p>{error}</p><button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setReloadKey((key) => key + 1); }}>Try again</button></div>}
      {loading && <p className="loading-message" role="status">Loading resident accounts...</p>}
      {!loading && !error && users.length === 0 && <section className="empty-state"><h2>No residents found</h2><p>Try searching with another name, email or mobile number.</p></section>}
      <div className="user-list">
        {users.map((resident) => (
          <article className="user-card" key={resident._id}>
            <div>
              <h2><Link to={`/admin/users/${resident._id}`}>{resident.name}</Link></h2>
              <p>{resident.email} · {resident.mobile}</p>
              <small>Joined {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(resident.createdAt))}</small>
            </div>
            <div className="user-status-actions">
              <span className={`account-status${resident.isSuspended ? " account-suspended" : ""}`}>
                {resident.isSuspended ? "Suspended" : "Active"}
              </span>
              <button className={resident.isSuspended ? "btn btn-secondary" : "btn btn-danger"} type="button" onClick={() => toggleSuspension(resident)} disabled={busyId === resident._id}>
                {busyId === resident._id ? "Saving..." : resident.isSuspended ? "Restore access" : "Suspend account"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {total > 25 && (
        <div className="pagination-actions">
          <button className="btn btn-secondary" type="button" onClick={() => { setPage((current) => current - 1); setLoading(true); }} disabled={page <= 1 || loading}>Previous</button>
          <span>Page {page} of {Math.ceil(total / 25)}</span>
          <button className="btn btn-secondary" type="button" onClick={() => { setPage((current) => current + 1); setLoading(true); }} disabled={page >= Math.ceil(total / 25) || loading}>Next</button>
        </div>
      )}
    </main>
  );
}

function AppContent() {
  const { pathname } = useLocation();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [apiError, setApiError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [liveStatus, setLiveStatus] = useState("connecting");

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (active) {
          setUser(null);
          if (error.status !== 401) setApiError(error.message);
        }
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, [authRetryKey]);

  useEffect(() => {
    if (!user) return undefined;

    const eventSource = new EventSource(`${API_URL}/events`, { withCredentials: true });
    eventSource.onopen = () => setLiveStatus("connected");
    eventSource.onerror = () => setLiveStatus("connecting");
    eventSource.addEventListener("ready", () => setLiveStatus("connected"));
    eventSource.addEventListener("complaint.updated", () => {
      window.dispatchEvent(new Event("complaint:updated"));
    });
    eventSource.addEventListener("account.suspended", () => {
      setUser(null);
      setApiError("This account has been suspended. Contact the portal administrator for assistance.");
      window.dispatchEvent(new Event("account:suspended"));
    });

    return () => eventSource.close();
  }, [user]);

  async function logout() {
    setLogoutBusy(true);
    setApiError("");
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      setUser(null);
    } catch (error) {
      setApiError(error.message);
    } finally {
      setLogoutBusy(false);
    }
  }

  function retryConnection() {
    setApiError("");
    setAuthChecked(false);
    setAuthRetryKey((key) => key + 1);
  }

  if (!authChecked) return <div className="loading-screen">Loading portal...</div>;

  return (
    <div className="app-shell">
      <Header user={user} onLogout={logout} logoutBusy={logoutBusy} liveStatus={liveStatus} />
      {apiError && (
        <div className="api-alert" role="status">
          <span>API connection issue: {apiError}</span>
          <button className="btn btn-secondary" type="button" onClick={retryConnection}>Try again</button>
        </div>
      )}
      <div className="route-content">
        <Routes>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" onAuthenticated={setUser} />} />
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" onAuthenticated={setUser} />} />
          <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <PasswordResetPage />} />
          <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <PasswordResetPage reset />} />
          <Route path="/complaint" element={user?.role === "citizen" ? <ComplaintPage /> : user ? <Navigate to="/admin" replace /> : <Navigate to="/login" replace />} />
          <Route path="/complaint/:id/edit" element={user?.role === "citizen" ? <ComplaintPage /> : user ? <Navigate to="/admin" replace /> : <Navigate to="/login" replace />} />
          <Route path="/my-complaints" element={user?.role === "citizen" ? <MyComplaintsPage /> : user ? <Navigate to="/admin" replace /> : <Navigate to="/login" replace />} />
          <Route path="/community" element={user?.role === "citizen" ? <CommunityPage /> : user ? <Navigate to="/admin" replace /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user?.role === "citizen" ? <ProfilePage user={user} onUserUpdated={setUser} /> : user ? <Navigate to="/admin" replace /> : <Navigate to="/login" replace />} />
          <Route path="/admin/login" element={user?.role === "admin" ? <Navigate to="/admin" replace /> : <AdminLoginPage onAuthenticated={setUser} />} />
          <Route path="/admin/analytics" element={user?.role === "admin" ? <AdminAnalyticsPage /> : <Navigate to="/admin/login" replace />} />
          <Route path="/admin/complaints/:id" element={user?.role === "admin" ? <AdminComplaintDetailsPage /> : <Navigate to="/admin/login" replace />} />
          <Route path="/admin/users/:id" element={user?.role === "admin" ? <AdminUserDetailsPage /> : <Navigate to="/admin/login" replace />} />
          <Route path="/admin" element={user?.role === "admin" ? <AdminComplaintsPage /> : <Navigate to="/admin/login" replace />} />
          <Route path="/admin/users" element={user?.role === "admin" ? <AdminUsersPage /> : <Navigate to="/admin/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <footer className="site-footer"><p>© 2026 Smart Digital Complaint and Resolution System</p></footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
