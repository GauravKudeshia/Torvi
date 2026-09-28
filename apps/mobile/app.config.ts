import type { ConfigContext, ExpoConfig } from 'expo/config';

// Only public native-app settings belong here. Never embed a provider key or
// OAuth client secret in a mobile binary. Auth0 uses PKCE with a native client.
const mobileConfig = ({ config }: ConfigContext): ExpoConfig => {
  const extra = {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL || config.extra?.apiUrl,
    auth0Domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN || config.extra?.auth0Domain,
    auth0ClientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID || config.extra?.auth0ClientId,
    auth0Audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE || config.extra?.auth0Audience,
    revenueCatAppleKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || config.extra?.revenueCatAppleKey,
    revenueCatGoogleKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || config.extra?.revenueCatGoogleKey,
    eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId },
  };
  if (process.env.TORVI_REQUIRE_MOBILE_CONFIG === '1') {
    const missing = ['apiUrl', 'auth0Domain', 'auth0ClientId', 'auth0Audience'].filter(key => !extra[key as keyof typeof extra]);
    if (!String(extra.apiUrl).startsWith('https://') || String(extra.apiUrl).includes('.example')) missing.push('valid HTTPS apiUrl');
    if (!extra.eas.projectId || extra.eas.projectId.includes('REPLACE_')) missing.push('EAS projectId');
    if (missing.length) throw new Error(`Mobile release configuration is incomplete: ${missing.join(', ')}. See docs/MOBILE_RELEASE.md.`);
  }
  return { ...config, name: config.name || 'Torvi', slug: config.slug || 'interview-copilot', extra };
};
export default mobileConfig;
