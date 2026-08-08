# SN Planning — Talk-about list

**Purpose:** Topics queued for design grill / home sessions — **not** built unless noted.  
**SoT priority still:** `docs/CURRENT_BACKLOG.md`  
**Updated:** 2026-08-07 (hygiene pass vs live backlog — **T6 TL0–TL12 fully shipped**; Maps v2 shipped; T7 design locked; T5 + Relations note-pins parked)

---

## Queued topics

| # | Topic | Notes / starting questions | Status |
|---|--------|----------------------------|--------|
| **T1** | **UI visual direction** | Linear A + Raycast. Doc: `docs/UI_Visual_Direction.md`. Chrome V0–V2 shipped. | **Locked + shipped** (chrome) |
| **T2** | **Lexical editor** | Deepen/polish existing stack. Doc: `docs/Lexical_Editor_Design.md`. **All T2 axes closed/shipped 2026-07-28**. | **Closed / shipped** |
| **T3** | **Amazon text / KDP standards** | Kindle-ready EPUB. Doc: `docs/Amazon_KDP_Export_Design.md`. KDP0–KDP4. | **Locked + shipped** (2026-07-28) |
| **T4** | **Context / token meter** | Local used-vs-left. Doc: `docs/Context_Token_Meter_Design.md`. M0–M5. | **Locked + shipped** |
| **T5** | **Freeform lore sheets + reliable layout write-back** | Rigid form vs real sheets. Map/layout canvas → **Maps v2** (shipped). Residual: sheet-first body, placeState/sheet RAG, non-map proposal UX. **Do not build until grilled + locked.** | **Parked — discuss** |
| **T6** | **Story Timeline** | In-world chronology board. Doc: `docs/Story_Timeline_Design.md`. | ✅ **TL0–TL12 shipped in full 2026-08-07** |
| **Maps v2** | **Sketch maps (Excalidraw)** | Doc: `docs/Maps_V2_Sketch_Design.md`. MV0–MV7. | ✅ **Shipped in full 2026-08-07** |
| **T7** | **Notes desk org + browse UI** | Doc: `docs/Notes_Org_Browse_Design.md`. Lorebook-shaped Browse+tabs; Cards\|List; cosmetic folders (`kind: notes`); thin tags; smart piles; **no** Notes graph. Slices **NO0–NO6**. | **Design locked** — P3 not started until promote |
| **Relations · note pins** | **Notes on the relationship graph** | Later: notes as **optional linked pins/leaves** on Relations (not a second graph on Notes). Complements Timeline multi-source pins. **Do not build with T7.** | **Parked — discuss with Relations** |

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
| Character playbook packs | PP0–PP5 **shipped**; **PP6** starter interview prose still open |
| SL rename + brand type | SL0–SL3 + SL5 + BT0–BT4 **shipped**; SL4/SL6 outside or separate |
| **Dep majors (pack 3)** | Backlog P3 — **low ROI freeze (2026-07-27).** Do **not** promote the pack. |
| **Scene Beat removal** | ✅ **Shipped** 2026-07-22 |
| **Chat model routing + chrome** | **Shipped** |
| Local in-process embeddings | **Shipped** IE0–IE6 |
| Advanced export profiles | Neighbor of T3 — not T3 |
| Spellcheck / LanguageTool depth | P3 open (light) |
| Gemini provider polish | `docs/gemini-provider-plan.md` |

---

## Session kickoff hint

When user says “SN Planning” or “talk list”:

1. Re-read live `docs/CURRENT_BACKLOG.md` — this file can lag  
2. Open / next candidates: **T7** Notes org (**design locked**, promote to build); **T5** parked (grill); **Relations · note pins** parked; **PP6** playbook prose; P1 polish / open bugs  
3. One topic at a time; lock to `docs/` when decided  
4. Don’t build T5 until grilled; don’t build **T7** until **promoted**  
5. Don’t re-grill closed T1–T4 / KDP / L0–L5 / **T6** / **Maps v2** / **T7 locks** unless user reopens  
6. Notes graph ≠ Notes desk — graph pins live under **Relations** later, not T7  

---

*Add rows here when user parks more “talk later” items.*
