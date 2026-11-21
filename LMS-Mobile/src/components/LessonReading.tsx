import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

/** True when instructor text carries markup (GitHub/ZIP imports store server-rendered, sanitized HTML). */
export function isHtmlContent(value: string | undefined): value is string {
  return !!value && /<[a-z][\s\S]*>/i.test(value);
}

function documentFor(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">
<style>body{font-family:-apple-system,Roboto,sans-serif;font-size:16px;line-height:1.55;color:#171717;margin:0;padding:4px 2px;word-wrap:break-word}
img{max-width:100%;height:auto}pre{overflow-x:auto;background:#f5f5f5;padding:8px;border-radius:6px}code{font-family:monospace}
table{border-collapse:collapse;display:block;overflow-x:auto}th,td{border:1px solid #e5e5e5;padding:4px 8px}a{color:#0f766e}</style>
</head><body>${html}</body></html>`;
}

/**
 * Shows lesson reading content inside the app. HTML (already sanitized by the server) renders in a
 * WebView with JavaScript off and a CSP that allows no scripts or network fetches except images;
 * links open in the system browser instead of inside the lesson.
 */
export function LessonReading({ content, height = 420 }: { content: string; height?: number }) {
  const [error, setError] = useState(false);
  if (!isHtmlContent(content) || Platform.OS === 'web') {
    return <Text className="text-base text-neutral-900">{isHtmlContent(content) ? content.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '') : content}</Text>;
  }
  return <View className="gap-2">
    <WebView
      originWhitelist={['about:blank']}
      source={{ html: documentFor(content) }}
      javaScriptEnabled={false}
      style={{ height, borderRadius: 12 }}
      onError={() => setError(true)}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank' || request.url.startsWith('data:')) return true;
        if (/^https?:\/\//i.test(request.url)) void Promise.resolve(Linking.openURL(request.url)).catch(() => undefined);
        return false;
      }}
    />
    {error ? <Text accessibilityRole="alert">This reading could not be shown. Pull down to refresh the course and try again.</Text> : null}
  </View>;
}
