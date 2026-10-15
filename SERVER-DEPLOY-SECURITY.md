# Digital NP Studio Server Deployment Notes

## Chrome / TikTok Session Isolation

Run one Digital NP Studio server process per customer/workspace. Do not share one running
process between unrelated users, because TikTok cookies, live windows, stream state, and
saved configs are intentionally long-lived.

For every server instance, set these environment variables:

```powershell
$env:NP_WEB_PORT = "4173"
$env:NP_WEB_DATA = "D:\np-studio-data\customer-001"
$env:NP_TENANT_ID = "customer-001"
$env:NP_CHROME_SCOPE = "customer-001"
$env:NP_PUBLIC_ORIGIN = "https://customer-001.example.com"
$env:NP_SECURE_COOKIE = "1"
```

Rules:

- `NP_WEB_DATA` must be a private folder for only that customer/workspace.
- `NP_TENANT_ID` or `NP_CHROME_SCOPE` must be unique per customer/workspace.
- Every TikTok/live account must use its own Chromium partition. The app builds it from
  `NP_CHROME_SCOPE` plus the owner-scoped account id, for example
  `persist:tiktok-rerun-tiktok-ky123456--main`.
- Put the app behind HTTPS reverse proxy. Keep the Node server bound to `127.0.0.1`.
- Never expose the `data` folder, browser profile folders, logs, or upload folders as static files.
- Never run two customers against the same `NP_WEB_DATA`.
- Never copy or reuse TikTok browser/session profile data between customers, NP users, or live accounts.
- Back up `NP_WEB_DATA`, but store backups encrypted because it contains TikTok browser sessions.

## Current Security Defaults

- Local server only listens on `127.0.0.1`.
- Session cookie is `HttpOnly`.
- CSRF token is required for POST requests.
- Host, Origin, and Referer are checked.
- Security headers and CSP are sent on every response.
- Sensitive Ads Manager UI/API is disabled until development resumes.
- `/api/shutdown` is disabled unless `NP_ALLOW_WEB_SHUTDOWN=1`.

## Multi-Customer Layout

Recommended production layout:

```text
Reverse proxy HTTPS
  customer-001.example.com -> 127.0.0.1:4173, NP_WEB_DATA=...\customer-001, NP_TENANT_ID=customer-001
  customer-002.example.com -> 127.0.0.1:4174, NP_WEB_DATA=...\customer-002, NP_TENANT_ID=customer-002
```

This makes each customer get their own Chromium profile, TikTok cookies, uploads, stream
config, chat config, pin config, and license state.

For the `rerun_tiktok` server folder:

```bash
NP_WEB_DATA=/home/nynum/rerun_tiktok/data
NP_TENANT_ID=rerun_tiktok
NP_CHROME_SCOPE=rerun_tiktok
NP_USER_ORIGIN=https://app.example.com
NP_ADMIN_ORIGIN=https://admin.example.com
```

User-facing Studio and admin/backoffice should run through separate hostnames. When
`NP_ADMIN_ORIGIN` is set, admin routes, `/api/admin/*`, and secure slip previews are
blocked from the public Studio hostname.
