import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';

/**
 * En développement (Expo Go) :
 *   Expo expose l'IP de ta machine via Constants.expoConfig.hostUri → ex. "192.168.1.42:8081"
 *   On extrait l'IP et on pointe sur le serveur web local (port 3000).
 *
 * En production :
 *   Pointe sur l'URL hébergée.
 */
function resolveUrl() {
  if (!__DEV__) return 'https://www.voisy.eu';

  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const ip = hostUri.split(':')[0];

  if (ip && ip !== 'localhost') {
    return `http://${ip}:3000`;
  }
  // Fallback : modifie manuellement si l'auto-détection échoue
  return 'http://localhost:3000';
}

const SOURCE_URL = resolveUrl();

export default function App() {
  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="light" backgroundColor="#2D6A4F" />
      <WebView
        source={{ uri: SOURCE_URL }}
        style={s.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        // Empêche la WebView de naviguer vers des URLs externes
        onShouldStartLoadWithRequest={req => req.url.startsWith(SOURCE_URL) || req.url.startsWith('https://sygbpqxzxhppxqjlomnk.supabase.co')}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2D6A4F' },
  webview:   { flex: 1 },
});
