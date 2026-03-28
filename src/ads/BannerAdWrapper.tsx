import { useEffect, useRef } from 'react';
import { hasNativeWebViewBridge } from '../infra/environment';
import { useTossBanner } from './useTossBanner';

interface BannerAdWrapperProps {
  adGroupId: string;
  mode?: 'fixed' | 'inline';
  showWebPlaceholder?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export function BannerAdWrapper({
  adGroupId,
  mode = 'fixed',
  showWebPlaceholder = false,
  onVisibilityChange
}: BannerAdWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isInitialized, attachBanner } = useTossBanner();
  const isNativeWebView = hasNativeWebViewBridge();

  useEffect(() => {
    if (!isNativeWebView) {
      onVisibilityChange?.(showWebPlaceholder);
      return;
    }
    if (!isInitialized || !containerRef.current) {
      onVisibilityChange?.(false);
      return;
    }

    let mounted = true;
    let destroyer: { destroy: () => void } | undefined;
    (async () => {
      onVisibilityChange?.(false);
      const attached = await attachBanner(adGroupId, containerRef.current as HTMLElement, {
        callbacks: {
          onAdRendered: () => {
            if (mounted) onVisibilityChange?.(true);
          },
          onNoFill: () => {
            if (mounted) onVisibilityChange?.(false);
          },
          onAdFailedToRender: () => {
            if (mounted) onVisibilityChange?.(false);
          }
        }
      });
      if (!mounted) {
        attached?.destroy();
        return;
      }
      if (!attached) {
        onVisibilityChange?.(false);
      }
      destroyer = attached;
    })();

    return () => {
      mounted = false;
      onVisibilityChange?.(false);
      destroyer?.destroy();
    };
  }, [adGroupId, attachBanner, isInitialized, isNativeWebView, onVisibilityChange, showWebPlaceholder]);

  if (!isNativeWebView) {
    if (!showWebPlaceholder) return null;
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
