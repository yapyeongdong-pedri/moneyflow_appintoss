export type RuntimeEnvironment = 'web' | 'sandbox' | 'toss';

export interface CapabilityFlags {
  tossShare: boolean;
  tossAds: boolean;
}

export function detectEnvironment(): RuntimeEnvironment {
  const userAgent = navigator.userAgent.toLowerCase();
  const hasWebView = Boolean((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView);
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

