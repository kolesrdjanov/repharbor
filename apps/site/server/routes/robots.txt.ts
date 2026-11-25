export default defineEventHandler((event) => {
  const origin = useRuntimeConfig(event).public.siteOrigin;
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  return `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`;
});
