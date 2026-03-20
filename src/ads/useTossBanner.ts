import { useCallback, useEffect, useRef, useState } from 'react';

type BannerAttachResult = { destroy: () => void } | undefined;

export function useTossBanner() {
  const [isInitialized, setIsInitialized] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let mounted = true;
    (async () => {
      try {
        const tossFramework = (await import('@apps-in-toss/web-framework')) as Record<string, unknown>;
        const tossAds = tossFramework.TossAds as Record<string, unknown> | undefined;
        const initialize = tossAds?.initialize as
          | ({ isSupported?: () => boolean } & ((args: { callbacks: { onInitialized: () => void } }) => void))
          | undefined;

        if (!initialize) return;
        const supported = initialize.isSupported ? initialize.isSupported() : true;
        if (!supported) return;

        initialize({
          callbacks: {
            onInitialized: () => {
              if (mounted) setIsInitialized(true);
            }
          }
        });
      } catch {
        // 웹 브라우저에서는 자연스럽게 미지원 처리
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const attachBanner = useCallback(async (adGroupId: string, element: HTMLElement): Promise<BannerAttachResult> => {
    if (!isInitialized) return undefined;
    try {
      const tossFramework = (await import('@apps-in-toss/web-framework')) as Record<string, unknown>;
      const tossAds = tossFramework.TossAds as Record<string, unknown> | undefined;
      const attachBannerFn = tossAds?.attachBanner as
        | ({ isSupported?: () => boolean } & ((id: string, target: HTMLElement, options?: unknown) => BannerAttachResult))
        | undefined;
      if (!attachBannerFn) return undefined;
      const supported = attachBannerFn.isSupported ? attachBannerFn.isSupported() : true;
      if (!supported) return undefined;
      return attachBannerFn(adGroupId, element, {
        theme: 'auto',
        tone: 'blackAndWhite',
        variant: 'expanded'
      });
    } catch {
      return undefined;
    }
  }, [isInitialized]);

  return { isInitialized, attachBanner };
}

