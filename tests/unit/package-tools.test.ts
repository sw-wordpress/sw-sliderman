import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Quasar, QBtn, QFile, QSelect } from 'quasar';
import { ApiError } from '@editor/api/client';
import { packages, fonts } from '@editor/api';
import { pickImage } from '@editor/composables/useMediaPicker';
import PackageTools from '@editor/features/sliders/PackageTools.vue';

const mocks = vi.hoisted(() => ({ push: vi.fn(), allowed: true }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@editor/config', () => ({
  can: () => mocks.allowed,
  getConfig: () => ({ siteId: 1, userId: 1, restRoot: 'http://localhost/api/' }),
}));
vi.mock('@editor/composables/useMediaPicker', () => ({ pickImage: vi.fn() }));
vi.mock('@editor/api', () => ({
  packages: {
    templates: vi.fn(),
    fromTemplate: vi.fn(),
    preview: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    status: vi.fn(),
  },
  fonts: { installations: vi.fn() },
}));
const token = 'c'.repeat(32);
const complete = {
  token,
  title: 'Portable hero',
  conflicts: [],
  complete: true,
  media: [],
  fonts: [],
};
const render = () => mount(PackageTools, { global: { plugins: [Quasar] } });
function button(wrapper: ReturnType<typeof render>, label: string) {
  const found = wrapper.findAllComponents(QBtn).find((item) => item.props('label') === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  mocks.allowed = true;
  vi.mocked(packages.templates).mockResolvedValue([{ id: 'event', name: 'Event', version: 1 }]);
  vi.mocked(fonts.installations).mockResolvedValue([]);
  vi.mocked(packages.preview).mockResolvedValue(complete);
  vi.mocked(packages.commit).mockResolvedValue(12);
});

describe('package tools', () => {
  it('hides import tools without import permission', async () => {
    mocks.allowed = false;
    const wrapper = render();
    await flushPromises();
    expect(wrapper.text()).toBe('');
    expect(packages.templates).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('uses the standard card heading and compact, aligned package controls', async () => {
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get('.sws-card__header h2').text()).toBe('Templates and packages');
    expect(wrapper.find('.sws-card__body h2').exists()).toBe(false);
    expect(wrapper.get('.sws-card__subtitle').text()).toContain(
      'Imports create a new unpublished slider.',
    );
    expect(wrapper.findComponent(QSelect).props('dense')).toBe(true);
    expect(wrapper.findComponent(QFile).props('dense')).toBe(true);
    wrapper.unmount();
  });

  it('creates a separate slider from a local template', async () => {
    vi.mocked(packages.fromTemplate).mockResolvedValue(15);
    const wrapper = render();
    await flushPromises();
    wrapper.findComponent(QSelect).vm.$emit('update:modelValue', 'event');
    await flushPromises();
    await button(wrapper, 'Create from template').trigger('click');
    await flushPromises();
    expect(packages.fromTemplate).toHaveBeenCalledWith('event');
    expect(mocks.push).toHaveBeenCalledWith('/sliders/15');
    wrapper.unmount();
  });

  it('requires preview then confirmation and never commits on upload', async () => {
    const wrapper = render();
    await flushPromises();
    wrapper.findComponent(QFile).vm.$emit('update:modelValue', new File(['PK'], 'hero.zip'));
    await flushPromises();
    await button(wrapper, 'Check package').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Complete package with local resources.');
    expect(packages.commit).not.toHaveBeenCalled();
    await button(wrapper, 'Import as new draft').trigger('click');
    await flushPromises();
    expect(packages.commit).toHaveBeenCalledWith(token, {}, {});
    expect(mocks.push).toHaveBeenCalledWith('/sliders/12');
    wrapper.unmount();
  });

  it('lets the user cancel while the import is still running', async () => {
    const pending = new Promise<number>(() => {});
    vi.mocked(packages.commit).mockReturnValue(pending);
    vi.mocked(packages.cancel).mockResolvedValue(null);
    const wrapper = render();
    await flushPromises();
    wrapper.findComponent(QFile).vm.$emit('update:modelValue', new File(['PK'], 'hero.zip'));
    await flushPromises();
    await button(wrapper, 'Check package').trigger('click');
    await flushPromises();
    await button(wrapper, 'Import as new draft').trigger('click');
    await flushPromises();
    const cancel = button(wrapper, 'Cancel import');
    expect(cancel.props('disable')).toBe(false);
    await cancel.trigger('click');
    await flushPromises();
    expect(packages.cancel).toHaveBeenCalledWith(token);
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('requires local replacements for incomplete packages and can cancel staging', async () => {
    vi.mocked(packages.preview).mockResolvedValue({
      ...complete,
      complete: false,
      media: [{ id: 9, alt: 'View', file: null }],
      fonts: [{ id: 'old', family: 'Lato' }],
    });
    const wrapper = render();
    await flushPromises();
    wrapper.findComponent(QFile).vm.$emit('update:modelValue', new File(['PK'], 'hero.zip'));
    await flushPromises();
    await button(wrapper, 'Check package').trigger('click');
    await flushPromises();
    expect(button(wrapper, 'Import as new draft').props('disable')).toBe(true);
    vi.mocked(pickImage).mockResolvedValue({ id: 19, url: '/photo.jpg', alt: 'Local view' });
    await button(wrapper, 'Choose replacement for image View').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Local view');
    wrapper.findAllComponents(QSelect)[1]?.vm.$emit('update:modelValue', 'local-lato');
    await flushPromises();
    expect(button(wrapper, 'Import as new draft').props('disable')).toBe(false);
    await button(wrapper, 'Cancel import').trigger('click');
    await flushPromises();
    expect(packages.cancel).toHaveBeenCalledWith(token);
    expect(packages.commit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('recovers an owned session after reloading and opens its completed draft', async () => {
    sessionStorage.setItem(
      'sws-package-preview:http://localhost/api/:1:1',
      JSON.stringify(complete),
    );
    vi.mocked(packages.status).mockResolvedValue({
      state: 'completed',
      id: 42,
      done: 3,
      total: 3,
      message: '',
    });
    const wrapper = render();
    await flushPromises();
    expect(wrapper.text()).toContain('Portable hero');
    await button(wrapper, 'Check import status').trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith('/sliders/42');
    expect(sessionStorage.length).toBe(0);
    wrapper.unmount();
  });

  it('discards expired sessions so another archive can be selected', async () => {
    sessionStorage.setItem(
      'sws-package-preview:http://localhost/api/:1:1',
      JSON.stringify(complete),
    );
    vi.mocked(packages.status).mockRejectedValue(
      new ApiError('sws_package_session', 'Expired package', 422),
    );
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Expired package');
    expect(wrapper.findComponent(QFile).props('disable')).toBe(false);
    expect(sessionStorage.length).toBe(0);
    wrapper.unmount();
  });

  it('shows errors and permits a corrected confirmation without re-uploading', async () => {
    vi.mocked(packages.commit).mockRejectedValueOnce(new Error('Missing font variant'));
    const wrapper = render();
    await flushPromises();
    wrapper.findComponent(QFile).vm.$emit('update:modelValue', new File(['PK'], 'hero.zip'));
    await flushPromises();
    await button(wrapper, 'Check package').trigger('click');
    await flushPromises();
    await button(wrapper, 'Import as new draft').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Missing font variant');
    expect(packages.preview).toHaveBeenCalledTimes(1);
    await button(wrapper, 'Import as new draft').trigger('click');
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith('/sliders/12');
    wrapper.unmount();
  });
});
