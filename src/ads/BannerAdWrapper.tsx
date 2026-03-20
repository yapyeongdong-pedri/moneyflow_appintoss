import { useEffect, useRef } from 'react';
import { useTossBanner } from './useTossBanner';

interface BannerAdWrapperProps {
  adGroupId: string;
  mode?: 'fixed' | 'inline';
}

function isTossEnvironment(): boolean {
  return Boolean((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView);
}

export function BannerAdWrapper({ adGroupId, mode = 'fixed' }: BannerAdWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isInitialized, attachBanner } = useTossBanner();

  useEffect(() => {
    if (!isInitialized || !containerRef.current || !isTossEnvironment()) return;

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
  }, [adGroupId, attachBanner, isInitialized]);

  if (!isTossEnvironment()) {
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

