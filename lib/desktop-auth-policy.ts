const accountPathPrefixes = [
  '/api/v1/profile',
  '/api/v1/job-targets',
  '/api/v1/documents',
  '/api/v1/memory',
  '/api/v1/reports',
  '/api/v1/sessions',
  '/api/v1/preflight',
  '/api/v1/feature-flags',
  '/api/v1/interview-processes',
  '/api/v1/entitlements',
  '/api/v1/job-applications',
  '/api/v1/tools',
  '/api/v1/providers',
];

export function isDesktopAccountPathAllowed(pathname: string): boolean {
  return accountPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
