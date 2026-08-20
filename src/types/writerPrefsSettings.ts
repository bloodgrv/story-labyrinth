// Singleton settings row gating the distill_writer_prefs background job — mirrors GrammarSettings.
export interface WriterPrefsSettings {
    id: string;
    autoDistillEnabled: boolean;
    createdAt: Date;
}
