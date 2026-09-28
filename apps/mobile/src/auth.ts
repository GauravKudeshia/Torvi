import React from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import Purchases from 'react-native-purchases';
import { InterviewCopilotClient } from '@interview-copilot/sdk';

WebBrowser.maybeCompleteAuthSession();
export const extra = Constants.expoConfig?.extra ?? {};
const redirectUri = makeRedirectUri({ scheme: 'interviewcopilot', path: 'auth' });
const discovery = extra.auth0Domain ? { authorizationEndpoint: `https://${extra.auth0Domain}/authorize`, tokenEndpoint: `https://${extra.auth0Domain}/oauth/token` } : null;
export const mobileConfigured = Boolean(discovery && extra.auth0ClientId && extra.apiUrl && !String(extra.apiUrl).includes('.example'));
async function storeToken(token: { accessToken: string; expiresIn?: number; refreshToken?: string }) {
  await SecureStore.setItemAsync('access_token', token.accessToken);
  await SecureStore.setItemAsync('expires_at', String(Date.now() + (token.expiresIn ?? 3600) * 1000));
  if (token.refreshToken) await SecureStore.setItemAsync('refresh_token', token.refreshToken);
}
async function accessToken() {
  const token = await SecureStore.getItemAsync('access_token');
  const expiresAt = Number(await SecureStore.getItemAsync('expires_at') ?? 0);
  if (token && expiresAt > Date.now() + 60_000) return token;
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  if (refreshToken && discovery) {
    const refreshed = await refreshAsync({ clientId: extra.auth0ClientId, refreshToken }, discovery);
    await storeToken(refreshed); return refreshed.accessToken;
  }
  return null;
}
export const api = new InterviewCopilotClient(extra.apiUrl || 'https://api.interviewcopilot.example', accessToken);
export function useMobileAuth() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [error, setError] = React.useState('');
  const [request, response, promptAsync] = useAuthRequest({ clientId: extra.auth0ClientId || 'not-configured', responseType: 'code', usePKCE: true, redirectUri, scopes: ['openid', 'profile', 'email', 'offline_access'], extraParams: extra.auth0Audience ? { audience: extra.auth0Audience } : {} }, discovery);
  React.useEffect(() => { if (mobileConfigured) accessToken().then(token => setAuthenticated(Boolean(token))).catch(() => setError('Your sign-in expired. Sign in again to continue.')); }, []);
  React.useEffect(() => {
    if (response?.type !== 'success' || !discovery || !request?.codeVerifier) return;
    let disposed = false;
    void exchangeCodeAsync({ clientId: extra.auth0ClientId, code: response.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier } }, discovery).then(async token => {
      await storeToken(token); if (disposed) return; setAuthenticated(true); setError('');
      const key = Platform.OS === 'ios' ? extra.revenueCatAppleKey : extra.revenueCatGoogleKey;
      if (key) {
        try { const profile = await fetch(`${extra.apiUrl}/api/v1/profile`, { headers: { authorization: `Bearer ${token.accessToken}` } }).then(r => r.json()); if (profile.userId) { Purchases.configure({ apiKey: key }); await Purchases.logIn(profile.userId); } }
        catch { if (!disposed) setError('Signed in. Subscription status could not refresh; retry from your account.'); }
      }
    }).catch(() => { if (!disposed) setError('Sign-in failed. Please try again.'); });
    return () => { disposed = true; };
  }, [response, request]);
  async function signOut() {
    await Promise.all(['access_token', 'refresh_token', 'expires_at'].map(key => SecureStore.deleteItemAsync(key)));
    if (extra.revenueCatAppleKey || extra.revenueCatGoogleKey) await Purchases.logOut().catch(() => undefined);
    setAuthenticated(false);
  }
  return { authenticated, error, ready: mobileConfigured && Boolean(request), signIn: () => promptAsync(), signOut };
}
