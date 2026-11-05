/* global window */
/**
 * Editor side of the `sw-sliderman/slider` block (PLAN.md 11).
 *
 * Plain script on purpose: it uses the WordPress packages from the global `wp` object, so no
 * second React copy is bundled. The frontend markup is rendered server-side by the shared
 * renderer; the editor shows only a safe placeholder (no slider HTML, no runtime).
 * Texts come translated from PHP (`Block::strings()`), so the plugin keeps one gettext catalog.
 */
(function (wp) {
  const { registerBlockType } = wp.blocks;
  const { createElement: el, useState, useEffect } = wp.element;
  const { InspectorControls, useBlockProps } = wp.blockEditor;
  const { PanelBody, SelectControl, Placeholder, Spinner, Notice } = wp.components;
  const t = window.swsBlockStrings || {};
  const apiFetch = wp.apiFetch;

  registerBlockType('sw-sliderman/slider', {
    edit: function Edit({ attributes, setAttributes }) {
      const [sliders, setSliders] = useState(null);
      const [failed, setFailed] = useState(false);
      useEffect(() => {
        let active = true;
        apiFetch({ path: '/sw-sliderman/v1/sliders?perPage=100' })
          .then((items) => active && setSliders(Array.isArray(items) ? items : []))
          .catch(() => active && setFailed(true));
        return () => {
          active = false;
        };
      }, []);

      const list = sliders || [];
      const selected = list.find((item) => item.id === attributes.sliderId);
      const options = [{ value: 0, label: t.choose }].concat(
        list.map((item) => ({
          value: item.id,
          label: item.title + (item.publishedGmt ? '' : ' (' + t.notPublished + ')'),
        })),
      );
      const onChange = (value) => setAttributes({ sliderId: parseInt(value, 10) || 0 });

      let body;
      if (failed) {
        body = el(Notice, { status: 'warning', isDismissible: false }, t.loadFailed);
      } else if (null === sliders) {
        body = el(Spinner);
      } else {
        body = el(SelectControl, {
          label: t.slider,
          value: attributes.sliderId,
          options,
          onChange,
        });
      }

      let status = t.select;
      if (selected) {
        status = selected.publishedGmt
          ? (t.published || '').replace('%s', selected.title)
          : t.unpublished;
      } else if (attributes.sliderId > 0 && sliders) {
        status = t.missing;
      }

      return el(
        'div',
        useBlockProps(),
        el(InspectorControls, null, el(PanelBody, { title: t.slider }, body)),
        el(Placeholder, { icon: 'images-alt2', label: t.title, instructions: status }, body),
      );
    },
    save: function () {
      return null;
    },
  });
})(window.wp);
