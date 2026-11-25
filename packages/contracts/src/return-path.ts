const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const signedInRoute = new RegExp(
  `^/(?:companies/${uuid}(?:/(?:integrations|review|billing))?|engagements/${uuid}/(?:terms|claims|statement(?:/entries/${uuid})?))$`,
  'i',
);

export function safeReturnPath(value: string | undefined) {
  if (!value || value.length > 1024 || !/^\/(?!\/)/.test(value) || /[\\\s\x00-\x1f\x7f#]/.test(value)) return undefined;
  const path = value.split('?')[0];
  return path === '/portfolio' || path === '/onboarding' || signedInRoute.test(path) ? value : undefined;
}
