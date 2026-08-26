import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

// Remote Access — Login Instance Label (RF5, docs/Remote_Access_Funnel_Design.md §5c). Get-or-
// create singleton, same idiom as mcpServerAuthService.ts's own getOrCreateSettings.

const INSTANCE_LABEL_MAX_LENGTH = 80;

type InstallSettingsRow = typeof schema.installSettings.$inferSelect;

export const getOrCreateSettings = async (): Promise<InstallSettingsRow> => {
    const [existing] = await db.select().from(schema.installSettings);
    if (existing) return existing;

    const row: InstallSettingsRow = {
        id: crypto.randomUUID(),
        instanceLabel: null,
        updatedAt: new Date()
    };
    await db.insert(schema.installSettings).values(row);
    return row;
};

export const getInstanceLabel = async (): Promise<string | null> => {
    const settings = await getOrCreateSettings();
    return settings.instanceLabel;
};

export const setInstanceLabel = async (rawLabel: string): Promise<string | null> => {
    const trimmed = rawLabel.trim().slice(0, INSTANCE_LABEL_MAX_LENGTH);
    const instanceLabel = trimmed.length > 0 ? trimmed : null;

    const current = await getOrCreateSettings();
    await db
        .update(schema.installSettings)
        .set({ instanceLabel, updatedAt: new Date() })
        .where(eq(schema.installSettings.id, current.id));
    return instanceLabel;
};
