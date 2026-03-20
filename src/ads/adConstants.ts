export const BANNER_AD_TEST_LIST = 'ait-ad-test-banner-id';
export const BANNER_AD_TEST_FEED = 'ait-ad-test-native-image-id';
export const BANNER_AD_PROD_TEXT = 'ait.v2.live.REPLACE_WITH_PROD_TEXT_AD_ID';
export const BANNER_AD_PROD_IMAGE = 'ait.v2.live.REPLACE_WITH_PROD_IMAGE_AD_ID';

export function getBannerAdGroupId(kind: 'text' | 'image' = 'text'): string {
  if (import.meta.env.DEV) {
    return kind === 'text' ? BANNER_AD_TEST_LIST : BANNER_AD_TEST_FEED;
  }
  return kind === 'text' ? BANNER_AD_PROD_TEXT : BANNER_AD_PROD_IMAGE;
}

