# Context / Token Meter (T4) — Design

**Status:** **Design locked 2026-07-21** (grill) — **shipped 2026-07-22** (M0–M5). See `DECISIONS.md`'s "Context / Token Meter — M0-M5, Load-Bearing Decisions" and `docs/CURRENT_BACKLOG.md`.  
**Priority:** Done  
**Talk list:** T4  
**Related:** Settings IA (`docs/Transfer_Log_And_Settings_IA_Design.md` — **Local** heading for n_ctx); not Transfer log; not packet-injection transparency

---

## Job

Show **context window used vs left** (token pressure) so local-model work does not silently hit `n_ctx`.

- **Pre-send:** live estimate of the **full assembled prompt** (system + context packs + history + draft)  
- **Post-turn:** real usage when the provider reports it  
- **Not:** a dump of injected packet text / “why did it know X?” inspector  

---

## Locked decisions (grill 2026-07-21)

| # | Axis | Lock |
|---|------|------|
| **1** | Primary job | **Both:** pre-send estimate + post-turn usage when available |
| **2** | Provider scope | **Local always**; other providers **when usage is available**; else hide |
| **3** | UI placement | **Chip/bar always-on** (when in scope) + **expandable detail** |
| **4** | Pre-send measurement | **Hybrid:** char/heuristic while typing; **refine** on pause and/or at send when a better count exists |
| **5** | Window size (`n_ctx`) | **Fetch** from local server metadata when possible; **user override wins**; store with Local / model settings |
| **6** | What counts as used | **Full assembled prompt** for the total; expand shows **budget slices** (system / memory / lore / notes / outline / history / draft / etc. — whatever actually assembled) |
| **7** | Near ceiling | **Display only** by default; **optional soft-warn** confirm toggle (no hard block on estimate) |
| **8** | Which chats | Chip **only** when active path is **local** or **usage-capable**; hidden otherwise |
| **9** | Post-turn surface | **Last-turn/session chip** + **per-message badge** on assistant turns when usage known |
| **10** | Settings | **Local** default n_ctx (+ fetch); **per-feature override** path (C); v1 may ship Local default first with override hook ready |
| **11** | Priority | **P3** |
| **12** | Non-goals | See below |

---

## UI sketch

```
[ composer                                      ] [Send]
[ ████████░░░░  12.4k / 32k  ·  38% left  ▾     ]  ← chip/bar
     optional expand:
       system ……… 1.2k
       lore ……… … 3.1k
       history …… 6.0k
       draft ………  2.1k
       …
```

- Colors: calm → amber → red as % used climbs (thresholds implementer-chosen; e.g. 70% / 90%).  
- Expand is **budget slices**, not full prompt text.  
- Soft-warn (if enabled): confirm before send when estimate ≥ threshold (default threshold e.g. 90%).

### Message badge

When response includes usage (or refined count): small muted badge on assistant message — e.g. `in 8.2k · out 640 · total 8.8k` (fields as reported).

---

## Data / settings sketch

| Setting | Where | Notes |
|---------|--------|--------|
| `contextWindowTokens` (or equiv.) | Local / AI settings | Default window size |
| `contextWindowOverride` | Optional per feature-endpoint | Wins over default when set |
| `fetchContextWindow` | Local | Try LM Studio /models (or compat) metadata |
| `softWarnNearLimit` | Chat or Local settings | Default **off** |
| `softWarnThreshold` | optional | Default ~0.9 |

Pre-send path should reuse the **same assembly mental model** as `chatContextService` / generate (sizes of pieces), without requiring a second divergent prompt builder long-term. v1 may approximate from known packet string lengths if full dry-assemble is expensive — document tradeoff in DECISIONS if so.

---

## Measurement detail

| Phase | Behavior |
|-------|----------|
| Typing | Debounced heuristic (e.g. chars/4 or simple BPE-ish) on draft + last-known context sizes |
| Pause / pre-send | Prefer server or local tokenizer count of assembled prompt when available |
| After response | Prefer provider `usage` (prompt/completion/total); update chip + message badge |

If refine fails: keep heuristic and mark UI as **est.**  

---

## Non-goals (v1)

1. Full injected-text / packet inspector  
2. **Hard-block** send at 100% estimate  
3. Perfect tokenizer coverage for every cloud model  
4. Billing / $ cost estimates  
5. Transfer log (separate: `docs/Transfer_Log_And_Settings_IA_Design.md`)  
6. Changing RAG or assembly policy — meter **observes** only  

---

## Implementation slices

| Slice | Work |
|-------|------|
| **M0** | Settings: local n_ctx, fetch-from-server, user override; soft-warn toggle |
| **M1** | Estimate pipeline: hybrid count + optional refine; slice sizes from assembly |
| **M2** | Composer chip/bar + expand slices; show only local/usage-capable |
| **M3** | Capture response usage → chip + per-message badge |
| **M4** | Optional soft-warn confirm at threshold |
| **M5** | DECISIONS + backlog Done when shipped |

---

## Acceptance criteria

- [ ] On local chats, user sees used/left (or %) before send for full assembled pressure  
- [ ] Expand shows budget slices, not raw packet dump  
- [ ] n_ctx from fetch and/or override; override wins  
- [ ] When provider returns usage, chip and message badge update  
- [ ] Meter hidden when neither local nor usage-capable  
- [ ] Soft-warn only if enabled; never hard-blocks on estimate alone  
- [ ] No RAG/assembly behavior change from this feature alone  

---

## Document history

- 2026-07-21 — Grill locked; this doc created  
- 2026-07-22 — M0–M5 shipped. See `DECISIONS.md`'s "Context / Token Meter — M0-M5, Load-Bearing Decisions" entry.
