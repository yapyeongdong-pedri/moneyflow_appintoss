import { defineConfig } from '@apps-in-toss/web-framework';

export default defineConfig({
  appName: '머니플로우',
  navigationBar: {
    withBackButton: true,
    withHomeButton: true
  },
  brand: {
    displayName: '머니플로우',
    primaryColor: '#3182F6'
  }
});
