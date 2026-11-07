import type { InjectionKey, Ref } from 'vue';
import type { Path } from '@editor/effects/schemaTools';

/** What the schema fields need from the effect panel. */
export interface EffectForm {
  /** Parameters with defaults filled in (what the effect runs with). */
  readonly values: Ref<Record<string, unknown>>;
  set(path: Path, value: unknown): void;
  reset(path: Path): void;
  begin(): void;
  end(): void;
}

export const EFFECT_FORM: InjectionKey<EffectForm> = Symbol('effect-form');
