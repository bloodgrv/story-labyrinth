# Remote Access — Tailscale Funnel (+ session hardening)

**Status:** Design **locked** 2026-08-24; **RF0/RF1/RF2/RF3/RF5 shipped 2026-08-25** (see `DECISIONS.md`'s "Remote Access — RF5/RF1/RF2/RF3 (...)" entries and `CURRENT_BACKLOG.md`). **RF4 (optional Owner TOTP) not built** — parked, "only if always-on Funnel still feels thin" per its own row below.  
**RF0 (docs):** README Funnel subsection + this doc + DECISIONS/backlog — **landed with lock**.  
**Canonical ops:** `README.md` → Remote Access via Tailscale (Serve + Funnel).

---

## 1. Job

Give **one owner** (and optional **editor**) easy browser access to a self-hosted Story Labyrinth instance from places where installing Tailscale is painful (especially a locked-down **work PC**), **without** turning SL into a public multi-tenant product.

| In | Out |
|----|-----|
| Funnel as **work / no-TS escape hatch** | Public marketing URL / random sharing |
| Serve (or LAN) for devices **on** the tailnet | Requiring Tailscale on the work machine |
| SL Owner/Editor login as the app door | Custom domain on Funnel |
| Light session hardening for internet-facing login | Embedding **tsnet** inside the Node server |
| Optional later: CF Tunnel + Access | Full bank-grade IdP / WebAuthn v1 |

---

## 2. Architecture

```
Work browser  --HTTPS-->  Tailscale Funnel relays
                              |
                     TS node / docker sidecar
                              |
                     http://127.0.0.1:3000  (SL, not WAN-published)
                              |
                         SL login (roles)
```

| Path | Audience |
|------|----------|
| **Tailscale Serve** | Devices on the tailnet (home, phone with TS) |
| **Tailscale Funnel** | Browser only — no TS client (work, hotel kiosk pattern) |
| **LAN bind** | Local network only; not a substitute for Funnel |

**URL:** `https://<machine>.<tailnet>.ts.net` (ports **443** / **8443** / **10000** only).  
**Bandwidth:** Funnel has non-configurable caps — fine for writing + AI; not a CDN.

**tsnet:** Correct *concept* (embedded Tailscale + optional `ListenFunnel`) for **Go** programs. SL is **Node/Express**. v1 = host `tailscale funnel` or the existing **Tailscale Docker sidecar**, not a Go rewrite inside the app.

---

## 3. Locked decisions

| # | Axis | Lock |
|---|------|------|
| 1 | Posture | Funnel = **escape hatch**, not primary day-to-day at home |
| 2 | Exposure | Prefer **on-demand** Funnel when practical; always-on OK only after P0 ops + RF1/RF2 |
| 3 | Accounts | Editor/viewer = **SL users**, not Tailscale accounts |
| 4 | Surface | App **loopback / no host WAN publish** when Funnel is used (`BIND_HOST=127.0.0.1` or `docker-compose.tailscale.yml`) |
| 5 | Cookies | **`COOKIE_SECURE=true`** whenever Funnel or Serve HTTPS terminates TLS in front of the app |
| 6 | Absolute session (remote profile) | **1 day** max lifetime (see §5 — clock starts/rebased when Remote turns **on**) |
| 7 | Idle logout (remote profile) | **1 hour** server-side sliding idle (see §5) |
| 8 | Local / non-remote default | Keep current **30-day** absolute session; **no** idle timeout while Remote is **off** |
| 9 | How remote profile is chosen | **In-app Remote toggle** (primary). Optional env default for new logins. **Not** IP heuristics |
| 10 | Hardening floor before daily work use | P0 ops + **RF1** + **RF2** + **RF3** (toggle + 1d/1h) |
| 11 | 2FA / CF Access | **Optional P2** — not blockers for Funnel |
| 12 | Product UI | **Required:** left-rail **Remote** control **above Logout** (§5b). README Funnel ops. Settings card optional later |
| 13 | Custom domain / CF | Out of Funnel scope; CF Tunnel+Access is plan B if `ts.net` or caps annoy |
| 14 | What the toggle does **not** do | Does **not** start/stop Tailscale Funnel on the host (ops/CLI only) |
| 15 | Login identity label | **Instance label** (owner-set) on login page — “right box?” check for Funnel/LAN (§5c). **Not** a public username roster |

---

## 4. Phase 0 — Ops prerequisites (no app code)

Do before enabling Funnel:

1. Tailnet: MagicDNS + HTTPS certificates enabled; Funnel allowed (ACL / `nodeAttrs` funnel).
2. Client: current Tailscale stable (Funnel CLI changed ~1.52 — use `tailscale funnel --help` on the box).
3. Bind: loopback-only or sidecar with **no** host port on `0.0.0.0`.
4. Env: `COOKIE_SECURE=true`.
5. Strong Owner password; separate Editor user if a second person writes.
6. Do not post the Funnel hostname publicly; treat it like a house key.

### Enable sketches

**Bare metal** (app on `127.0.0.1:3000`):

```bash
tailscale funnel --bg https / http://127.0.0.1:3000
tailscale funnel status
# disable: tailscale funnel reset   # or version-specific path off
```

**Docker sidecar** (mirror existing Serve):

```bash
docker exec story-labyrinth-tailscale \
  tailscale funnel --bg https / http://localhost:3000
```

Verify Funnel config survives container restart via `./tailscale-state` (same volume as Serve).

---

## 5. Sessions — absolute vs idle

**Today (pre-RF):** single absolute expiry only — `SESSION_DURATION_MS = 30 days`. No `lastSeenAt` / idle. Cookie maxAge matches.

### Two clocks (remote profile)

| Clock | Remote lock | Behavior |
|-------|-------------|----------|
| **Absolute max** | **1 day** from session issue | Hard ceiling even if “active” all day |
| **Idle** | **1 hour** without authenticated API activity | Sliding; activity refreshes idle deadline |

Whichever fires first kills the session (delete server row + clear cookie on next request).

### How short *can* idle be?

| Idle | Verdict for SL |
|------|----------------|
| **≤15 min** | Technically fine; **bad writer UX** (coffee, phone, long model stream, reading a chapter) |
| **30 min** | Secure-leaning OK if user accepts more re-logins |
| **1 hour** | **Locked default** — best balance for work writing |
| **2–4 hour** | Softer; still meaningful vs 30-day cookie |
| Client-only JS timer | **Not sufficient** as sole control (close laptop ≠ kill server session) |

**Floor we will not ship as default:** sub-15-minute idle for this product. Owner may get an env override later; default stays **1h**.

### Implementation notes (RF3)

- Add `sessions.lastSeenAt` (timestamp) and `sessions.remoteProfile` (boolean, default false).
- On `validateSession` success when `remoteProfile`:
  - if `now > expiresAt` or idle exceeded (`now - lastSeenAt > 1h`) → delete session, 401
  - else throttle-touch `lastSeenAt` (e.g. at most once per 60s); cookie maxAge may slide with idle remaining but **never** past absolute `expiresAt`
- Absolute remote ceiling: `expiresAt = min(existing, remoteArmedAt + 1 day)` — on first arm, set `expiresAt = now + 1 day` (rebase so a leftover 30d cookie cannot outlive remote policy).
- Turning Remote **off**: clear `remoteProfile`; set `expiresAt = now + 30 days` (local default); idle checks stop. User is opting into the home posture on that browser.
- Optional env `REMOTE_SESSION_DEFAULT=1`: new logins start with `remoteProfile=true` (always-on Funnel hosts). Toggle can still turn off per session. **Not** required if user always flips the sidebar control.
- No IP/geo heuristics.

### Idle vs “auto logout if not in use”

Same feature if **server-authoritative**. A browser idle banner (“you’ll be logged out in 2 min”) is UX sugar only; server idle is SoT.

---

## 5b. Remote toggle (left sidebar) — required UI

**Placement:** desktop `Sidebar.tsx` footer cluster — **immediately above** `LogoutButton` (after Server status, before Logout). Collapse-friendly: icon + tooltip when `collapsed`; label **Remote** when expanded.

**Who:** any authenticated role (Owner / Editor / Viewer) — the person at the keyboard is declaring *this browser* is less trusted.

**Control:** switch or pressed toggle (not a navigation button). Visible **on** state (e.g. accent / “Remote on”) so work posture is obvious.

**Behavior:**

| Action | Server |
|--------|--------|
| Remote **ON** | `remoteProfile=true`; `lastSeenAt=now`; **rebase** `expiresAt` to `now+1d`; Set-Cookie with shorter maxAge |
| Remote **OFF** | `remoteProfile=false`; `expiresAt=now+30d`; clear idle enforcement; refresh cookie |
| Read | `GET /api/auth/status` (or me) includes `remoteProfile` + optional `expiresAt` / idle remaining for UI |

**Route:** e.g. `PATCH /api/auth/me/remote-session` `{ enabled: boolean }` — `requireAuth`, self-only (not owner-gated).

**Does not:** enable Funnel, open ports, or change other users’ sessions. **Revoke all** remains Owner (RF2).

**Mobile:** TopBar overflow or account menu twin **above Logout** if Logout is only easy to reach there; desktop left rail is the SoT placement. Do not bury solely in Settings.

**Copy (tooltip / title):** short — e.g. “Stricter session on this browser (1 day max, 1 hour idle). Use on work or shared PCs.” Not a Funnel admin control.

**Login optional later:** “This is a remote device” checkbox — nice-to-have; sidebar toggle is the locked v1 surface.

---

## 5c. Login instance label (“right login?”)

**Job:** When opening a Funnel/LAN URL, show a human label so the author knows this is *their* Story Labyrinth (not a sibling machine, staging box, or wrong bookmark) **before** typing a password.

**Not:** Public list of usernames, “who can log in,” or marketing subtitle for strangers.

### Lock

| Piece | Choice |
|-------|--------|
| Field | Single install-wide string: **`instanceLabel`** (display name / author line) |
| Who edits | **Owner only** |
| Where edited | **Settings → Users** — field at top of the Users panel (`UsersTool`), not buried only under Appearance |
| Storage | One row/column for the install (prefer small app/settings singleton or dedicated column — **not** per-user `username`; implementer picks existing settings pattern if one fits, else minimal migration) |
| Max length | **80** characters trimmed; empty allowed |
| Public read | `GET /api/auth/status` includes `instanceLabel: string \| null` while **logged out** (needed for login UI) |
| Login UI | If non-empty: show prominently under BrandMark / as card subtitle (e.g. “Reuben’s den” or author name). If empty: keep current generic “Story Labyrinth is password-protected.” |
| First-run register | No label yet — optional “Instance name” on create-account is **out**; set later in Settings |
| Privacy | Do **not** expose other users’ usernames or roles on the login page |
| Default | Empty / null after migrate — owner fills when they care (Funnel) |

**Copy hint under the Settings field:** “Shown on the login page so you can confirm you’re on the right server (useful with remote access).”

**Slice:** **RF5** (can ship with RF0/RF3 wave or alone — small, no dependency on idle/Funnel process).

---

## 6. Auth hardening slices

Auth fundamentals already solid for private deploy (scrypt, httpOnly cookie, hashed tokens, role gates, in-memory lockout). Funnel raises the bar for **internet-facing login screen**.

| ID | Slice | Done when |
|----|--------|-----------|
| **RF0** | Docs: README Funnel subsection + this design; ops checklist | ✅ Landed 2026-08-24 with design lock |
| **RF1** | Durable login lockout (survive restart) + IP (or coarse) throttle on `POST` login | ✅ Shipped 2026-08-25 — burst / restart doesn't wipe protection |
| **RF2** | Owner **Revoke all sessions** (+ optional session list) | ✅ Shipped 2026-08-25 — stolen/work cookie recoverable without password change (session-list half not built, marked optional) |
| **RF3** | Session flags + **1d/1h** policy + **Sidebar Remote toggle** above Logout | ✅ Shipped 2026-08-25 — toggle on/off verified; idle + absolute enforced server-side |
| **RF4** | Optional Owner TOTP (backup codes) | **Not built** — parked; only if always-on Funnel still feels thin |
| **RF5** | **Login instance label** — Settings → Users field; public on `/api/auth/status`; LoginPage display | ✅ Shipped 2026-08-25 — non-empty label shows on login; empty = generic copy; no username roster |

**P0 ops** (bind, `COOKIE_SECURE`, passwords, Funnel ACL) are mandatory before enable; they are not a code slice.

**Build order followed:** RF0 (docs) → RF5 (label) → RF1 → RF2 → RF3. RF4 remains parked.

### Explicit non-goals (v1)

- Rewriting CSRF for multi-origin
- Per-story ACLs
- tsnet-in-process
- Captcha
- Forcing CF Access
- In-app start/stop of host Funnel process

### Related review debt (higher urgency once Funnel is on; not RF blockers)

- SSRF hardening on Research `fetchPage` (existing code-review item)
- Editor mass-assignment allowlists
- Avoid returning raw API keys to any session you wouldn’t trust on a work PC (Owner discipline + revoke)

---

## 7. Security model (one paragraph)

Funnel makes the **login page** reachable by anyone who has the URL. It does **not** bypass SL auth. Tailscale identity is **not** applied to Funnel visitors. Defense is: minimize URL leak + strong passwords + **user-armed** remote short sessions/idle (sidebar toggle) + durable lockout + revoke-all + loopback bind + secure cookies. Optional second door (CF Access or TOTP) is layered later, not required to call Funnel “done” for personal use.

---

## 8. Testing checklist

- [ ] Off-tailnet browser hits Funnel HTTPS → login — **not verified** (needs a real Funnel deployment, out of reach of the dev sandbox)
- [x] Wrong password lockout survives process restart (RF1) — verified 2026-08-25 against a real server restart
- [x] After revoke-all, old cookie 401s (RF2) — verified 2026-08-25
- [x] Remote **ON**: session absolute >1d rejected; idle >1h → 401 — verified 2026-08-25 via direct DB manipulation of `expiresAt`/`lastSeenAt`
- [x] Remote **OFF**: 30d posture; no idle kill — verified 2026-08-25
- [x] Toggle sits above Logout in left sidebar (expanded + collapsed) — verified 2026-08-25, also added to `MainLayout.tsx`'s icon rail
- [x] Toggle does not claim to control Funnel process — copy reviewed, matches lock
- [ ] `COOKIE_SECURE=true` session works on HTTPS Funnel URL — **not verified** (needs a real HTTPS-terminating deployment)
- [ ] App not reachable on WAN via raw `:3000` when using recommended bind/sidecar — **not verified** (ops-level, needs a real deployment)

---

## 9. Document history

| Date | Note |
|------|------|
| 2026-08-24 | Locked from Telegram planning: Funnel escape hatch; Serve home; no tsnet-in-Node; remote **1d** absolute; idle lean **1h**; RF0–RF4; 2FA optional |
| 2026-08-24 | **Remote toggle** locked — left sidebar above Logout; per-session `remoteProfile`; does not start Funnel |
| 2026-08-24 | **RF5** login **instance label** — Settings → Users; shown on LoginPage via public auth status |
