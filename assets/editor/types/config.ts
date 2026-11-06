export interface EffectPresetInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly seed: number;
  /** Partial parameters; only declared values override the schema defaults. */
  readonly params: Record<string, unknown>;
}

/** One registered GPU effect type (built-in or add-on), see src/Infrastructure/EffectRegistry.php. */
export interface EffectInfo {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly category: string;
  readonly continuous: boolean;
  readonly schemaVersion: number;
  readonly schema: unknown;
  readonly presets: readonly EffectPresetInfo[];
  /** Media library slots the effect reads, e.g. `image`. */
  readonly assets: ReadonlyArray<{ readonly key: string; readonly label: string }>;
  /** Same-origin ES module URL (with version). */
  readonly module: string;
  readonly builtin: boolean;
}

/** Configuration printed by src/Admin/AdminPage.php::config(). */
export interface EditorConfig {
  readonly restRoot: string;
  readonly coreRestRoot: string;
  readonly effects: readonly EffectInfo[];
  readonly nonce: string;
  readonly locale: string;
  readonly userId: number;
  readonly siteId: number;
  readonly version: string;
  readonly adminUrl: string;
  readonly capabilities: readonly string[];
  readonly fontsOffline: boolean;
}
