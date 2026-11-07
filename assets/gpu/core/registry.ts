import { EffectConfigError, EffectUnavailableError } from './errors';
import { checkSchema, validateParams, withDefaults } from './schema';
import { TYPE_ID_MAX_LENGTH, TYPE_ID_PATTERN } from './types';
import type { EffectConfig, EffectContext, EffectInstance, EffectModule } from './types';

type Loader<TDevice> = () => Promise<EffectModule<TDevice>>;

/**
 * Effect modules by type id. The core imports no module: built-in modules and add-ons register
 * a module or a lazy loader (`import()`), so a new effect never grows the base bundle.
 */
export class EffectRegistry<TDevice = unknown> {
  private readonly modules = new Map<string, EffectModule<TDevice>>();
  private readonly loaders = new Map<string, Loader<TDevice>>();
  private readonly loading = new Map<string, Promise<EffectModule<TDevice>>>();

  register(module: EffectModule<TDevice>): void {
    this.assertType(module.type);
    this.assertFree(module.type);
    this.assertModule(module, module.type);
    this.modules.set(module.type, module);
  }

  registerLoader(type: string, loader: Loader<TDevice>): void {
    this.assertType(type);
    this.assertFree(type);
    this.loaders.set(type, loader);
  }

  has(type: string): boolean {
    return this.modules.has(type) || this.loaders.has(type);
  }

  types(): string[] {
    return [...new Set([...this.modules.keys(), ...this.loaders.keys()])].sort((a, b) => a.localeCompare(b));
  }

  /** Loads (once) and returns the module. A failed load is not cached, so a retry can succeed. */
  async load(type: string): Promise<EffectModule<TDevice>> {
    const ready = this.modules.get(type);
    if (ready) return ready;
    const pending = this.loading.get(type);
    if (pending) return pending;
    const loader = this.loaders.get(type);
    if (!loader) throw new EffectUnavailableError(type, 'unknown');
    const promise = loader().then(
      (module) => {
        this.assertModule(module, type);
        this.modules.set(type, module);
        this.loaders.delete(type);
        return module;
      },
      (error: unknown) => {
        throw error instanceof EffectUnavailableError
          ? error
          : new EffectUnavailableError(type, 'load_failed', error);
      },
    );
    this.loading.set(type, promise);
    try {
      return await promise;
    } finally {
      this.loading.delete(type);
    }
  }

  /**
   * Resolves the final parameters (upgrade, defaults) and validates them. Throws
   * `EffectConfigError` with the issue list; never returns invalid parameters.
   */
  async resolveParams(
    config: EffectConfig,
  ): Promise<{ module: EffectModule<TDevice>; params: Record<string, unknown> }> {
    const module = await this.load(config.type);
    let params = config.params;
    if (config.schemaVersion !== module.schemaVersion) {
      if (config.schemaVersion < module.schemaVersion && module.migrate) {
        params = module.migrate(params, config.schemaVersion);
      } else {
        throw new EffectConfigError(config.type, [
          { path: '/schemaVersion', code: 'schema_version' },
        ]);
      }
    }
    const full = withDefaults(module.parameterSchema, params) as Record<string, unknown>;
    const issues = validateParams(module.parameterSchema, full);
    if (issues.length > 0) throw new EffectConfigError(config.type, issues);
    return { module, params: full };
  }

  async create(config: EffectConfig, context: EffectContext<TDevice>): Promise<EffectInstance> {
    const { module, params } = await this.resolveParams(config);
    return module.create(context, params);
  }

  private assertType(type: string): void {
    if (type.length > TYPE_ID_MAX_LENGTH || !TYPE_ID_PATTERN.test(type))
      throw new EffectUnavailableError(type, 'invalid_module');
  }

  private assertFree(type: string): void {
    if (this.has(type)) throw new Error(`Effect type "${type}" is already registered.`);
  }

  private assertModule(module: EffectModule<TDevice>, type: string): void {
    if (module.type !== type || checkSchema(module.parameterSchema).length > 0) {
      throw new EffectUnavailableError(type, 'invalid_module');
    }
  }
}
