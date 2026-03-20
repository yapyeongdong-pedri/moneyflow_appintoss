import { useEffect, useRef } from 'react';
import { hasNativeWebViewBridge } from '../infra/environment';
import { useTossBanner } from './useTossBanner';

interface BannerAdWrapperProps {
  adGroupId: string;
  mode?: 'fixed' | 'inline';
}

export function BannerAdWrapper({ adGroupId, mode = 'fixed' }: BannerAdWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isInitialized, attachBanner } = useTossBanner();
  const isNativeWebView = hasNativeWebViewBridge();

  useEffect(() => {
    if (!isInitialized || !containerRef.current || !isNativeWebView) return;

    let mounted = true;
    let destroyer: { destroy: () => void } | undefined;
    (async () => {
      const attached = await attachBanner(adGroupId, containerRef.current as HTMLElement);
      if (!mounted) {
        attached?.destroy();
        return;
      }
      destroyer = attached;
    })();

    return () => {
      mounted = false;
      destroyer?.destroy();
    };
  }, [adGroupId, attachBanner, isInitialized, isNativeWebView]);

  if (!isNativeWebView) {
    return (
      <div className="banner-placeholder" aria-label="광고 자리">
        광고 배너 미리보기
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: mode === 'fixed' ? 96 : undefined, minHeight: mode === 'inline' ? 50 : undefined }}
    />
  );
}
