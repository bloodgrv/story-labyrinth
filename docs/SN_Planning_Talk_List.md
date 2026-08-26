# SN Planning — Talk-about list

**Purpose:** Topics queued for design grill / home sessions — **not** built unless noted.  
**SoT priority still:** `docs/CURRENT_BACKLOG.md`  
**Updated:** 2026-08-24 (**Remote Access / Funnel** design locked — RF0 docs landed; RF1–RF4 code not built. Prior 2026-08-23: **T8** closed/satisfied; **T13** shipped. Ship-status may lag — trust `CURRENT_BACKLOG.md`)

---

## Queued topics

| # | Topic | Notes / starting questions | Status |
|---|--------|----------------------------|--------|
| **T1** | **UI visual direction** | Linear A + Raycast. Doc: `docs/UI_Visual_Direction.md`. Chrome V0–V2 shipped. | **Locked + shipped** (chrome) |
| **T2** | **Lexical editor** | Deepen/polish existing stack. Doc: `docs/Lexical_Editor_Design.md`. **All T2 axes closed/shipped 2026-07-28**. | **Closed / shipped** |
| **T3** | **Amazon text / KDP standards** | Kindle-ready EPUB. Doc: `docs/Amazon_KDP_Export_Design.md`. KDP0–KDP4. | **Locked + shipped** (2026-07-28) |
| **T4** | **Context / token meter** | Local used-vs-left. Doc: `docs/Context_Token_Meter_Design.md`. M0–M5. | **Locked + shipped** |
| **T5** | **Lore Sheet + Sync Loop** | Sheet-first `sheetBody` SoT; hybrid parse → Codex/description + cross-desk cards. Doc: `docs/Lore_Sheet_And_Sync_Design.md`. Slices **FS0–FS8** all done. Natural View retired. Maps canvas stays Maps v2. | ✅ **FS0–FS8 shipped in full (2026-08-09)** |
| **T6** | **Story Timeline** | In-world chronology board. Doc: `docs/Story_Timeline_Design.md`. | ✅ **TL0–TL12 shipped in full 2026-08-07** |
| **Maps v2** | **Sketch maps (Excalidraw)** | Doc: `docs/Maps_V2_Sketch_Design.md`. MV0–MV7. | ✅ **Shipped in full 2026-08-07** |
| **T7** | **Notes desk org + browse UI** | Doc: `docs/Notes_Org_Browse_Design.md`. Lorebook-shaped Browse+tabs; Cards\|List; cosmetic folders (`kind: notes`); thin tags; smart piles; **no** Notes graph. Slices **NO0–NO6**. | ✅ **Shipped** (2026-08-08) |
| **Relations · note pins** | **Notes on the relationship graph** | Later: notes as **optional linked pins/leaves** on Relations (not a second graph on Notes). Complements Timeline multi-source pins. **Do not build with T7.** | **Parked — discuss with Relations** |
| **T8** | **UX/UI polish cleanup (full toolbox)** | Originally: hierarchy/density/chrome quieting with full toolbox kept. **No dedicated T8 design/slices.** Intent covered over time by **T1** chrome tokens, **T10** chat rails, brand/type, Tour, Inject, lorebook density/folders, etc. User closed 2026-08-23: “done what I wanted.” Fresh polish = new topic if reopened. | ✅ **Closed / satisfied (2026-08-23)** — not a slice-ship epic |
| **T9** | **Lore Sheet inline rework with AI** | Sub-span "Rework in chat" for the Lore Sheet textarea. Doc: `docs/Lore_Sheet_Inline_Rework_Design.md`. Slices **IR0–IR6**. | ✅ **Shipped in full (2026-08-12)** |
| **T10** | **Chat chrome declutter (icon rail + drawers)** | Doc: `docs/Chat_Chrome_Declutter_Design.md`. CR0–CR8. ≠ T8. | ✅ **Shipped in full (2026-08-11)** |
| **AI Review** | **Manuscript human-editor desk** | Doc: `docs/AI_Review_Design.md`. Multi-chapter / whole book; Quick + Deep; durable findings (`dev` / soft `continuity` / elevated `voice`); sidebar tool + Editor entry; actions: scribble + Editor chat seed (no direct Notes, no Humanizer on desk). ≠ RAG Scanner. Slices **AR0–AR6**. | **Locked 2026-08-14 — not built until promoted** |
| **Activity Stoplight** | **Global running-work indicator** | Doc: `docs/Activity_Stoplight_Design.md`. TopBar lamp+count over `agentJobs`; expand task list; workspace `/` only; ≠ pending-review dots. Slices **AS0–AS5**. | **Locked 2026-08-14 — not built until promoted** |
| **Auto Humanizer** | **Silent AI→editor commit pipeline + Editor Humanize sheet** | Doc: `docs/Auto_Humanizer_Design.md`. **Separate** from shipped manual Humanizer. Detect+threshold+tone; Accept prose hard silent. **Editor rail SimpleSheet `humanize`** hosts **both** Manual + Auto. Slices **AH0–AH8**. | ✅ **Shipped** (2026-08-15) — verify backlog |
| **Code review debt** | **Hardening from 2026-08-17/18 audit** | Doc: `docs/CODE_REVIEW_2026-08-17.md`. Backlog **B22–B44** (path jail, SSRF, MultiView same-chapter LWW, Codex approve TOCTOU, chat switch state, secrets redaction, …). Pick slices; not one mega-PR. | **Open on backlog** |
| **T11** | **First-start tour** | **Tour** (spotlight + card): first provider → Brainstorm chat basics → Guide/help + **Replay at Guide top**. Doc: `docs/First_Start_Tour_Design.md`. Owner auto-once; per-user `onboardingTourCompleted`; Skip points at Replay; test story OK; Next free on provider. Slices **OT0–OT8**. **≠** T8. **≠** playbook rewrite. | **Locked 2026-08-21 — not built until promoted** |
| **T12** | **System prompts → Local System Inject** | **First slice locked:** global local-only house-rules inject + on/off + presets. Doc: `docs/Local_System_Inject_Design.md`. Settings → Local = body + preset CRUD; chat rail = toggle + preset dropdown only; one SoT; default Off; prepend on `provider===local`. **Guide topic required** (`local-system-inject.mdx` + search + settings-nav/prompts links). Slices **LI0–LI5**. Broader prompt inventory/rewrite still future under T12 umbrella if reopened. | ✅ **Shipped** (2026-08-21) — verify backlog |
| **Mac portable** | **Windows-twin Mac zip** | Doc: `docs/Mac_Portable_Design.md`. Bundled Node + `.command` + `data/` + Updates; arm64 first; two zip kinds (fresh + update); build on macOS/CI only; MP0 shared Win updater fix. **≠** Docker-on-Mac. **≠** Electron. Slices **MP0–MP4** (+ optional MP5 x64). | **Locked 2026-08-22 — not built until promoted** |
| **T13** | **Lorebook custom drag order** | Doc: `docs/Lorebook_Custom_Order_Design.md`. Cosmetic DB `manualOrder`; sort **Custom**; List+Cards; bucket `level+scopeId+category+folderId`; dual-drop reorder vs file; search disables rank drag; `PATCH /api/lorebook/reorder`. Slices **LO0–LO5**. | ✅ **Shipped** (2026-08-23) |
| **Remote / Funnel** | **Tailscale Funnel + session hardening** | Doc: `docs/Remote_Access_Funnel_Design.md`. Work escape hatch (no TS on client); Serve home. Remote **on**: 1d + 1h idle; sidebar **Remote** above Logout. **RF5** login instance label (Settings → Users). RF0 docs ✅; RF1–RF5 code when promoted. | **Locked 2026-08-24** — promote to build |

---

## Also on the board (designed or parked elsewhere)

| Item | Where |
|------|--------|
| Chat shuttle H* | `docs/Chat_Shuttle_Design.md` — **H0–H7 shipped** |
| **Transfer log + Settings IA** | `docs/Transfer_Log_And_Settings_IA_Design.md` — **shipped** |
| **Lorebook browse density** | `docs/Lorebook_Browse_Density_Design.md` — **shipped** P2 **B8** |
| **Folders (cosmetic org)** | `docs/Folders_Org_Design.md` — **shipped** P2 **B9**; **T7 extends** to note artifacts |
| Import to Outline OI* | `docs/Outline_Import_Design.md` — **shipped** OI0–OI8 |
| Brainstorm / new-story import | Parked note in Outline Import doc |
| Research S* / Notes desk K* | **Shipped** (P0.4) — T7 is browse/org shell on top |
| Name gen / Locations L0–L5 | **shipped**; product map **tool** → **Maps v2 (shipped)** |
| Character playbook packs | **PP0–PP6 shipped** (incl. starter prose) |
| SL rename + brand type | SL0–SL3 + SL5 + BT0–BT4 **shipped**; SL4/SL6 outside or separate |
| **Dep majors (pack 3)** | Backlog P3 — **low ROI freeze (2026-07-27).** Do **not** promote the pack. |
| **Scene Beat removal** | ✅ **Shipped** 2026-07-22 |
| **Chat model routing + chrome** | **Shipped** |
| Local in-process embeddings | **Shipped** IE0–IE6 |
| Windows portable + Unraid/Docker publish | **Shipped** (portable 2026-08-21; Docker Hub 2026-08-22) — verify backlog |
| **Mac portable** | **Design locked** `docs/Mac_Portable_Design.md` — MP0–MP4; promote to build |
| Advanced export profiles | Neighbor of T3 — not T3 |
| Spellcheck / LanguageTool depth | P3 open (light) |
| Gemini provider polish | `docs/gemini-provider-plan.md` |
| **Lorebook entry split proposal** | Parked 2026-08-14 — not designed |

---

## Session kickoff hint

When user says “SN Planning” or “talk list”:

1. Re-read live `docs/CURRENT_BACKLOG.md` — this file can lag  
2. Open / next candidates: **Relations · note pins**; residual P2 / code-review leftovers; parked design (Brainstorm import, lorebook entry-split). (AR/AS/AH/**T8**/**T11**/**T12**/**T13**/Mac portable closed or shipped — verify backlog.)  
3. One topic at a time; lock to `docs/` when decided  
4. Don’t re-offer **T8** as open polish epic. Don’t re-offer shipped AR/AS/AH/**T11**/**T12**/**T13** as unbuilt.  
5. Don’t re-grill closed T1–T7 / **T8** / KDP / L0–L5 / **T6** / **Maps v2** / **T5** / **T9** / **T10** unless user reopens  
6. **T11 ≠ T8** — first-run **tour** vs general chrome polish (T8 closed/satisfied)  
7. Notes graph ≠ Notes desk — graph pins live under **Relations** later, not T7  
8. **T8 closed** — was layout/hierarchy/polish; intent absorbed by later chrome work; reopen only for a new named pass  
9. **AI Review ≠ Scanner** — craft/voice/dev vs factual Codex proof; separate queues  
10. **Activity Stoplight ≠** pending-review dots — machine busy vs needs-you  
11. **Auto Humanizer ≠ manual Humanizer** — pipeline on Accept vs select+click; ≠ AI Review rewrite  
12. **T12 Local Inject** — ✅ shipped (2026-08-21); global local-only; Settings edits body/presets; rail = toggle+dropdown only; never delete `{{codex_context}}` as the substitute  
13. **T11 Tour** — ✅ shipped (2026-08-21); owner auto-once; Replay on Guide top; Skip → Guide tip; OT* ≠ Lore Sheet FS*; no hard provider gate
14. **T13 Custom order** — ✅ shipped (2026-08-23), same day as design lock; LO0–LO5; cosmetic only; dual-drop; no RAG meaning 

---

*Add rows here when user parks more “talk later” items.*
