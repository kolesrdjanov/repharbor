export function usePublicPage(title: string, description: string, path: string) {
  const origin = useRuntimeConfig().public.siteOrigin;
  const canonical = new URL(path, origin).href;
  useSeoMeta({
    title, description, ogTitle: title, ogDescription: description,
    ogUrl: canonical, ogType: 'website', ogSiteName: 'RepHarbor',
  });
  useHead({ link: [{ rel: 'canonical', href: canonical }] });
}
