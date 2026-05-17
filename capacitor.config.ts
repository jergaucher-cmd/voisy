import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'eu.voisy.app',
  appName: 'Voisy',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
