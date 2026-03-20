export type RuntimeEnvironment = 'web' | 'sandbox' | 'toss';

export interface CapabilityFlags {
  tossShare: boolean;
  tossAds: boolean;
}

const ENV_QUERY_KEY = 'mf_env';
const WEBVIEW_QUERY_KEY = 'mf_webview';

function readEnvOverride(): RuntimeEnvironment | null {
  const raw = new URLSearchParams(window.location.search).get(ENV_QUERY_KEY)?.toLowerCase();
  if (raw === 'web' || raw === 'sandbox' || raw === 'toss') return raw;
  return null;
}

function shouldMockWebViewBridge(): boolean {
  const raw = new URLSearchParams(window.location.search).get(WEBVIEW_QUERY_KEY)?.toLowerCase();
  return raw === '1' || raw === 'true';
}

export function hasNativeWebViewBridge(): boolean {
  return Boolean((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView);
}

export function hasWebViewBridgeForPreview(): boolean {
  return hasNativeWebViewBridge() || shouldMockWebViewBridge();
}

export function detectEnvironment(): RuntimeEnvironment {
  const userAgent = navigator.userAgent.toLowerCase();
  const envOverride = readEnvOverride();
  if (envOverride) return envOverride;

  const hasWebView = hasWebViewBridgeForPreview();
  if (hasWebView && userAgent.includes('toss')) return 'toss';
  if (hasWebView) return 'sandbox';
  return 'web';
}

export function getCapabilityFlags(env: RuntimeEnvironment): CapabilityFlags {
  return {
    tossShare: env !== 'web',
    tossAds: env !== 'web'
  };
}
