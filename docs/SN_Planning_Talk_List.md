# SN Planning — Talk-about list

**Purpose:** Topics queued for design grill / home sessions — **not** built unless noted.  
**SoT priority still:** `docs/CURRENT_BACKLOG.md`  
**Updated:** 2026-07-28 (T3 Amazon/KDP design locked)

---

## Queued topics

| # | Topic | Notes / starting questions | Status |
|---|--------|----------------------------|--------|
| **T1** | **UI visual direction** | Linear A + Raycast. Doc: `docs/UI_Visual_Direction.md`. Chrome V0–V2 shipped. | **Locked + shipped** (chrome) |
| **T2** | **Lexical editor** | Deepen/polish existing stack (not rip-and-replace). Doc: `docs/Lexical_Editor_Design.md`. **Plugin-add locked:** List+CheckList ADD; tables C; skip/defer playground extras; upgrade 0.39→0.48 pairing (LE0–LE3). Open: list done-bar, toolbar/mobile/selection, collab residue. | **Partial lock** (plugin-add); other axes discuss |
| **T3** | **Amazon text / KDP standards** | Kindle-ready EPUB (+ thin hygiene on EPUB path). Doc: `docs/Amazon_KDP_Export_Design.md`. Slices **KDP0–KDP4**. | **Locked** (P3, not started) |
| **T4** | **Context / token meter** | Local used-vs-left (+ usage-capable). Doc: `docs/Context_Token_Meter_Design.md`. M0–M5. | **Locked + shipped** |

---

## Also on the board (designed or parked elsewhere)

| Item | Where |
|------|--------|
| Chat shuttle H* | `docs/Chat_Shuttle_Design.md` — **H0–H7 shipped** |
| **Transfer log + Settings IA** | `docs/Transfer_Log_And_Settings_IA_Design.md` — **locked**; S0 then T0–T3; P3 |
| **Lorebook browse density** | `docs/Lorebook_Browse_Density_Design.md` — **locked/shipped** P2 **B8** (verify backlog) |
| **Folders (cosmetic org)** | `docs/Folders_Org_Design.md` — **locked/shipped** P2 **B9** (verify backlog) |
| Import to Outline OI* | `docs/Outline_Import_Design.md` (locked) |
| Brainstorm / new-story import | Parked note in Outline Import doc |
| Research S* / Notes desk K* | **Shipped** (P0.4) |
| Name gen / Locations & maps | Own design docs |
| **Dep majors (pack 3)** | Backlog P3 parked — **low ROI freeze (2026-07-27).** Not a feature mission. Do **not** promote the pack. Open **one family only** if forced (CVE/node), a concrete bug maps to that package, or a single boredom PR. Prefer: sqlite **12.x patchline** smoke, knip/tool minors, jspdf 4 only if PDF hurts. **Hard park:** Tailwind 4, panels 4, router 8, TS 7, Vite 8 drive-bys. Never couple with LE* or feature builds. |
| **Scene Beat removal** | ✅ **Shipped in full 2026-07-22.** `docs/Scene_Beat_Removal_Design.md` — SB0-SB8 done, including table drop (user-confirmed), see `DECISIONS.md` |
| **Chat model routing + chrome** | `docs/Chat_Model_Routing_And_Chrome_Design.md` — **locked**; Cloud\|Local; collapse memory; compact list; MR*/CC0/CL0; P3 |

---

## Session kickoff hint

When user says “SN Planning” or “talk list”:

1. Offer **T2 remaining axes** + **T3** (locked, not started — promote to build) + other design-locked P3 leftovers if any  
2. One topic at a time; lock to `docs/` when decided  
3. Don’t start Lexical **build** on open T2 axes until locked/promoted — plugin-add design is locked; don’t re-grill List/CheckList/tables-C unless reopened  
4. Don’t start Amazon/KDP **build** until promoted (T3 design locked: `docs/Amazon_KDP_Export_Design.md`, KDP0–KDP4)

---

*Add rows here when user parks more “talk later” items.*
