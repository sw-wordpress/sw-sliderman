import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Editor script of the `sw-sliderman/slider` block (assets/block/editor.js). It is a plain script
 * using the WordPress globals, so it runs here against minimal stand-ins for `wp.*` and React hooks.
 */
interface Node {
  readonly type: unknown;
  readonly props: Record<string, unknown> | null;
  readonly children: unknown[];
}
type Attributes = { sliderId: number };
type EditProps = { attributes: Attributes; setAttributes: (value: Partial<Attributes>) => void };
interface Summary {
  id: number;
  title: string;
  publishedGmt: string | null;
}

const STRINGS = {
  title: 'SW SliderMan',
  slider: 'Slider',
  select: 'Select a slider.',
  choose: '— Select a slider —',
  notPublished: 'not published',
  published: 'Published slider: %s',
  unpublished: 'Not published yet',
  missing: 'Not found',
  loadFailed: 'List failed',
};

const element = (
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node => ({
  type,
  props,
  children,
});
const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && 'type' in value && 'children' in value;

function find(tree: unknown, type: string): Node[] {
  if (!isNode(tree)) return [];
  const own = tree.type === type ? [tree] : [];
  const nested = [...tree.children, ...Object.values(tree.props ?? {})].flatMap((child) =>
    find(child, type),
  );
  return [...own, ...nested];
}

let registered: { edit: (props: EditProps) => Node; save: () => unknown } | null = null;
const apiFetch = vi.fn();

interface Mounted {
  stateIndex: number;
  effectIndex: number;
  states: unknown[];
  effectDeps: Array<unknown[] | undefined>;
  pending: Array<() => void>;
  cleanups: Array<(() => void) | void>;
  dirty: boolean;
}
let current: Mounted | null = null;

/** The script reads `window.wp` once at load, so the stand-ins are fixed and consult `current`. */
function installWp(): void {
  const ctx = (): Mounted => {
    if (!current) throw new Error('no mounted block');
    return current;
  };
  (window as unknown as { wp: unknown }).wp = {
    blocks: {
      registerBlockType: (_name: string, settings: typeof registered) => (registered = settings),
    },
    element: {
      createElement: element,
      useState: (initial: unknown) => {
        const mounted = ctx();
        const slot = mounted.stateIndex++;
        if (!(slot in mounted.states)) mounted.states[slot] = initial;
        return [
          mounted.states[slot],
          (value: unknown) => {
            mounted.states[slot] = value;
            mounted.dirty = true;
          },
        ];
      },
      useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
        const mounted = ctx();
        const slot = mounted.effectIndex++;
        const previous = mounted.effectDeps[slot];
        const changed = !previous || !deps || deps.some((dep, i) => !Object.is(dep, previous[i]));
        mounted.effectDeps[slot] = deps;
        if (changed) {
          mounted.pending.push(() => {
            mounted.cleanups[slot]?.();
            mounted.cleanups[slot] = effect();
          });
        }
      },
    },
    blockEditor: { InspectorControls: 'Inspector', useBlockProps: () => ({ className: 'block' }) },
    components: {
      PanelBody: 'PanelBody',
      SelectControl: 'SelectControl',
      Placeholder: 'Placeholder',
      Spinner: 'Spinner',
      Notice: 'Notice',
    },
    apiFetch,
  };
}

/** Minimal hook runtime: re-renders after state changes and runs effects whose dependencies changed. */
function mount(attributes: Attributes) {
  const mounted: Mounted = {
    stateIndex: 0,
    effectIndex: 0,
    states: [],
    effectDeps: [],
    pending: [],
    cleanups: [],
    dirty: false,
  };
  let tree: Node = element('empty', null);
  const setAttributes = vi.fn();
  const render = () => {
    current = mounted;
    mounted.stateIndex = 0;
    mounted.effectIndex = 0;
    mounted.dirty = false;
    tree = registered?.edit({ attributes, setAttributes }) ?? element('missing', null);
    const run = mounted.pending;
    mounted.pending = [];
    run.forEach((effect) => effect());
  };
  const settle = async () => {
    for (let i = 0; i < 20; i++) {
      render();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!mounted.dirty && mounted.pending.length === 0) break;
    }
    render();
  };
  return { settle, setAttributes, tree: () => tree, render };
}

async function load(): Promise<void> {
  vi.resetModules();
  installWp();
  (window as unknown as { swsBlockStrings: unknown }).swsBlockStrings = STRINGS;
  const url = '../../assets/block/editor.js';
  await import(/* @vite-ignore */ url);
}

const slider = (id: number, published = true): Summary => ({
  id,
  title: `Slider ${id}`,
  publishedGmt: published ? '2026-01-01 00:00:00' : null,
});

const optionLabels = (tree: Node) =>
  (
    (find(tree, 'SelectControl')[0]?.props?.options as Array<{ label: string }> | undefined) ?? []
  ).map((option) => option.label);
const instructions = (tree: Node) => find(tree, 'Placeholder')[0]?.props?.instructions;

beforeEach(async () => {
  registered = null;
  apiFetch.mockReset();
  await load();
});

describe('block editor script', () => {
  it('registers the dynamic block without saved markup', () => {
    expect(registered).not.toBeNull();
    expect(registered?.save()).toBeNull();
  });

  it('shows a spinner and the neutral instruction while the list loads', () => {
    apiFetch.mockReturnValue(new Promise(() => undefined));
    const view = mount({ sliderId: 0 });
    view.render();
    expect(find(view.tree(), 'Spinner').length).toBeGreaterThan(0);
    expect(instructions(view.tree())).toBe(STRINGS.select);
  });

  it('loads every list page, so sliders beyond the first 100 are selectable', async () => {
    const first = Array.from({ length: 100 }, (_, i) => slider(i + 1));
    apiFetch.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path.endsWith('page=1') ? first : path.endsWith('page=2') ? [slider(101)] : [],
      ),
    );
    const view = mount({ sliderId: 101 });
    await view.settle();
    expect(apiFetch.mock.calls.map((call) => call[0].path)).toEqual([
      '/sw-sliderman/v1/sliders?perPage=100&page=1',
      '/sw-sliderman/v1/sliders?perPage=100&page=2',
    ]);
    expect(optionLabels(view.tree())).toHaveLength(102);
    expect(instructions(view.tree())).toBe('Published slider: Slider 101');
  });

  it('flags unpublished sliders in the picker and the placeholder', async () => {
    apiFetch.mockResolvedValue([slider(1), slider(2, false)]);
    const view = mount({ sliderId: 2 });
    await view.settle();
    expect(optionLabels(view.tree())).toEqual([
      STRINGS.choose,
      'Slider 1',
      'Slider 2 (not published)',
    ]);
    expect(instructions(view.tree())).toBe(STRINGS.unpublished);
  });

  it('looks up a saved slider that is not in the list and offers it', async () => {
    apiFetch.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(path.includes('?') ? [slider(1)] : slider(7)),
    );
    const view = mount({ sliderId: 7 });
    await view.settle();
    expect(apiFetch.mock.calls.map((call) => call[0].path)).toContain('/sw-sliderman/v1/sliders/7');
    expect(optionLabels(view.tree())).toEqual([STRINGS.choose, 'Slider 7', 'Slider 1']);
    expect(instructions(view.tree())).toBe('Published slider: Slider 7');
  });

  it('reports a saved slider that no longer exists', async () => {
    apiFetch.mockImplementation(({ path }: { path: string }) =>
      path.includes('?') ? Promise.resolve([slider(1)]) : Promise.reject(new Error('404')),
    );
    const view = mount({ sliderId: 9 });
    await view.settle();
    expect(instructions(view.tree())).toBe(STRINGS.missing);
  });

  it('shows a warning and keeps the saved selection when the list cannot be loaded', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    const view = mount({ sliderId: 3 });
    await view.settle();
    expect(find(view.tree(), 'Notice').length).toBeGreaterThan(0);
    expect(view.setAttributes).not.toHaveBeenCalled();
  });

  it('ignores a malformed list response', async () => {
    apiFetch.mockResolvedValue({ unexpected: true });
    const view = mount({ sliderId: 0 });
    await view.settle();
    expect(optionLabels(view.tree())).toEqual([STRINGS.choose]);
  });

  it('stores the chosen id as an integer and treats invalid values as no selection', async () => {
    apiFetch.mockResolvedValue([slider(4)]);
    const view = mount({ sliderId: 0 });
    await view.settle();
    const onChange = find(view.tree(), 'SelectControl')[0]?.props?.onChange as (
      value: string,
    ) => void;
    onChange('4');
    onChange('abc');
    onChange('0');
    expect(view.setAttributes.mock.calls).toEqual([
      [{ sliderId: 4 }],
      [{ sliderId: 0 }],
      [{ sliderId: 0 }],
    ]);
  });
});
