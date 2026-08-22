# SN Planning — Talk-about list

**Purpose:** Topics queued for design grill / home sessions — **not** built unless noted.  
**SoT priority still:** `docs/CURRENT_BACKLOG.md`  
**Updated:** 2026-08-21 (**T12 Local System Inject shipped in full** — LI0–LI5, promoted and built same day as lock, see `CURRENT_BACKLOG.md`/`DECISIONS.md`. **T11 First-Start Tour locked** — `docs/First_Start_Tour_Design.md`, OT0–OT8, not built. Prior: code review debt B22–B44. Ship-status headers may lag — trust `CURRENT_BACKLOG.md`)

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
| **T8** | **UX/UI polish cleanup (full toolbox)** | User not happy with current look/feel; **keep all tool sections/desks** the product needs — cleaner hierarchy, density, chrome quieting, polish. **Not** a feature cull. Distinct from T1 chrome tokens (already shipped) and from T5 sheet SoT (content model). **Also distinct from T10** (chat-host chrome specifically, kept separate per user direction, not T8's first slice). Pilot candidate: Lorebook (post-T5), or app-wide pass. **Do not build until grilled + locked.** | **Parked — discuss** |
| **T9** | **Lore Sheet inline rework with AI** | Sub-span "Rework in chat" for the Lore Sheet textarea. Doc: `docs/Lore_Sheet_Inline_Rework_Design.md`. Slices **IR0–IR6**. | ✅ **Shipped in full (2026-08-12)** |
| **T10** | **Chat chrome declutter (icon rail + drawers)** | Doc: `docs/Chat_Chrome_Declutter_Design.md`. CR0–CR8. ≠ T8. | ✅ **Shipped in full (2026-08-11)** |
| **AI Review** | **Manuscript human-editor desk** | Doc: `docs/AI_Review_Design.md`. Multi-chapter / whole book; Quick + Deep; durable findings (`dev` / soft `continuity` / elevated `voice`); sidebar tool + Editor entry; actions: scribble + Editor chat seed (no direct Notes, no Humanizer on desk). ≠ RAG Scanner. Slices **AR0–AR6**. | **Locked 2026-08-14 — not built until promoted** |
| **Activity Stoplight** | **Global running-work indicator** | Doc: `docs/Activity_Stoplight_Design.md`. TopBar lamp+count over `agentJobs`; expand task list; workspace `/` only; ≠ pending-review dots. Slices **AS0–AS5**. | **Locked 2026-08-14 — not built until promoted** |
| **Auto Humanizer** | **Silent AI→editor commit pipeline + Editor Humanize sheet** | Doc: `docs/Auto_Humanizer_Design.md`. **Separate** from shipped manual Humanizer. Detect+threshold+tone; Accept prose hard silent. **Editor rail SimpleSheet `humanize`** hosts **both** Manual + Auto. Slices **AH0–AH8**. | ✅ **Shipped** (2026-08-15) — verify backlog |
| **Code review debt** | **Hardening from 2026-08-17/18 audit** | Doc: `docs/CODE_REVIEW_2026-08-17.md`. Backlog **B22–B44** (path jail, SSRF, MultiView same-chapter LWW, Codex approve TOCTOU, chat switch state, secrets redaction, …). Pick slices; not one mega-PR. | **Open on backlog** |
| **T11** | **First-start tour** | **Tour** (spotlight + card): first provider → Brainstorm chat basics → Guide/help + **Replay at Guide top**. Doc: `docs/First_Start_Tour_Design.md`. Owner auto-once; per-user `onboardingTourCompleted`; Skip points at Replay; test story OK; Next free on provider. Slices **OT0–OT8**. **≠** T8. **≠** playbook rewrite. | **Locked 2026-08-21 — not built until promoted** |
| **T12** | **System prompts → Local System Inject** | **First slice locked:** global local-only house-rules inject + on/off + presets. Doc: `docs/Local_System_Inject_Design.md`. Settings → Local = body + preset CRUD; chat rail = toggle + preset dropdown only; one SoT; default Off; prepend on `provider===local`. **Guide topic required** (`local-system-inject.mdx` + search + settings-nav/prompts links). Slices **LI0–LI5**. Broader prompt inventory/rewrite still future under T12 umbrella if reopened. | **Locked 2026-08-21 — not built until promoted** |

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
| Advanced export profiles | Neighbor of T3 — not T3 |
| Spellcheck / LanguageTool depth | P3 open (light) |
| Gemini provider polish | `docs/gemini-provider-plan.md` |
| **Lorebook entry split proposal** | Parked 2026-08-14 — not designed |

---

## Session kickoff hint

When user says “SN Planning” or “talk list”:

1. Re-read live `docs/CURRENT_BACKLOG.md` — this file can lag  
2. Open / next candidates: **T11 First-Start Tour** (locked — promote · OT0–OT8); **T8** UX polish (**parked**, grill first); **Relations · note pins**; residual P2/P1. (AR/AS/AH/**T12** shipped — verify backlog.)  
3. One topic at a time; lock to `docs/` when decided  
4. Don’t build **T8** until grilled + locked + promoted; don’t build **T11 Tour** until **promoted** (design locked). Don’t re-offer shipped AR/AS/AH/**T12** as unbuilt.  
5. Don’t re-grill closed T1–T7 / KDP / L0–L5 / **T6** / **Maps v2** / **T5** / **T9** / **T10** unless user reopens  
6. **T11 ≠ T8** — first-run **tour** (provider + Brainstorm chrome + Guide Replay) vs chrome polish of existing UI  
7. Notes graph ≠ Notes desk — graph pins live under **Relations** later, not T7  
8. **T8 ≠ T1** — T1 locked chrome tokens; T8 is layout/hierarchy/polish with full tool surface kept  
9. **AI Review ≠ Scanner** — craft/voice/dev vs factual Codex proof; separate queues  
10. **Activity Stoplight ≠** pending-review dots — machine busy vs needs-you  
11. **Auto Humanizer ≠ manual Humanizer** — pipeline on Accept vs select+click; ≠ AI Review rewrite  
12. **T12 Local Inject** — ✅ shipped (2026-08-21); global local-only; Settings edits body/presets; rail = toggle+dropdown only; never delete `{{codex_context}}` as the substitute  
13. **T11 Tour** — owner auto-once; Replay on Guide top; Skip → Guide tip; OT* ≠ Lore Sheet FS*; no hard provider gate 

---

*Add rows here when user parks more “talk later” items.*
