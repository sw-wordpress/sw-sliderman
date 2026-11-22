export default {
  title: 'SW Sliderman',
  description: 'User guide for the WordPress layer slider',
  lang: 'en-US',
  base: '/sw-sliderman/',
  srcExclude: ['README.md'],
  cleanUrls: false,
  themeConfig: {
    siteTitle: 'SW Sliderman',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Changelog', link: '/Changelog' },
    ],
    sidebar: [
      { text: 'Overview', link: '/' },
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Editor and drafts', link: '/editor' },
      { text: 'Responsive layout', link: '/responsive-layout' },
      { text: 'Playback and effects', link: '/playback-and-effects' },
      { text: 'Local fonts', link: '/fonts' },
      { text: 'Templates and packages', link: '/templates-and-packages' },
      { text: 'Troubleshooting', link: '/troubleshooting' },
      { text: 'Changelog', link: '/Changelog' },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/sw-wordpress/sw-sliderman' }],
    editLink: {
      pattern: 'https://github.com/sw-wordpress/sw-sliderman/edit/master/pages/:path',
      text: 'Edit this page on GitHub',
    },
  },
};
