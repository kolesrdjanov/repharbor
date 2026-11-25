import { publicRoutes } from './shared/content';

export default defineNuxtConfig({
  compatibilityDate: '2026-11-25',
  runtimeConfig: {
    public: {
      siteOrigin: 'https://repharbor.io',
      appOrigin: 'https://app.repharbor.io',
    },
  },
  app: { head: { htmlAttrs: { lang: 'en' }, meta: [{ name: 'theme-color', content: '#f7f7f7' }] } },
  components: [{ path: '~/components', ignore: ['ui/**'] }],
  css: ['@fontsource-variable/instrument-sans', '~/assets/main.css'],
  postcss: { plugins: { '@tailwindcss/postcss': {} } },
  nitro: { prerender: { crawlLinks: true, routes: [...publicRoutes, '/robots.txt', '/sitemap.xml'] } },
  telemetry: false,
});
