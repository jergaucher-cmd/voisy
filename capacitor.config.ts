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
  plugins: {
    OneSignal: {
      // L'App ID est passé à setAppId() en JS — pas besoin de le mettre ici
    },
  },
};

export default config;
