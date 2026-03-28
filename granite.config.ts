import { defineConfig } from '@apps-in-toss/web-framework';

const APP_NAME = '\uBA38\uB2C8\uD50C\uB85C\uC6B0';

export default defineConfig({
  appName: APP_NAME,
  navigationBar: {
    withBackButton: true,
    withHomeButton: true
  },
  brand: {
    displayName: APP_NAME,
    primaryColor: '#03224D'
  }
});
