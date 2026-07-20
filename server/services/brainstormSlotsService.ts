import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../db/client.js";
import { BRAINSTORM_SLOTS } from "../../src/types/brainstorm.js";
import type { BrainstormSlot, BrainstormSlotStatus } from "../../src/types/brainstorm.js";

// Rows are lazily seeded — a story with no brainstormSlots rows yet simply has every slot read
// back as "unknown" (see getSlots below); nothing is written until the user or an accepted
// overview-proposal actually flips one (setSlotStatus). No bulk-seed migration needed if
// BRAINSTORM_SLOTS grows later.

// Raw rows that exist for this story, keyed by slotKey — not padded out to the full fixed list
// (chatContextService.ts's resolveBrainstormSlots does that padding for context-assembly use;
// this is also called directly by the routes layer for the tray's slot-checklist GET, which
// wants the same "always all 5, default unknown" shape).
export const getSlots = async (storyId: string): Promise<BrainstormSlot[]> => {
    const rows = await db.select().from(schema.brainstormSlots).where(eq(schema.brainstormSlots.storyId, storyId));
    const byKey = new Map(rows.map(r => [r.slotKey, r.status as BrainstormSlotStatus]));
    return BRAINSTORM_SLOTS.map(s => ({ slotKey: s.key, label: s.label, status: byKey.get(s.key) ?? "unknown" }));
};

export const setSlotStatus = async (storyId: string, slotKey: string, status: BrainstormSlotStatus): Promise<BrainstormSlot> => {
    if (!BRAINSTORM_SLOTS.some(s => s.key === slotKey)) throw new Error(`Unknown slot key: ${slotKey}`);

    const [existing] = await db
        .select({ id: schema.brainstormSlots.id })
        .from(schema.brainstormSlots)
        .where(and(eq(schema.brainstormSlots.storyId, storyId), eq(schema.brainstormSlots.slotKey, slotKey)));

    if (existing) {
        await db.update(schema.brainstormSlots).set({ status, updatedAt: new Date() }).where(eq(schema.brainstormSlots.id, existing.id));
    } else {
        await db.insert(schema.brainstormSlots).values({ id: randomUUID(), storyId, slotKey, status, updatedAt: new Date() });
    }

    const label = BRAINSTORM_SLOTS.find(s => s.key === slotKey)?.label ?? slotKey;
    return { slotKey, label, status };
};
