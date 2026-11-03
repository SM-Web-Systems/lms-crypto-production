import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { LessonMediaProps } from './LessonMedia';
import { extractYoutubeId } from '../utils/mediaUrl';
import { ErrorBanner } from './ErrorBanner';

export function LessonYouTube(props: LessonMediaProps) {
  const web = useRef<WebView>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const initial = useRef(props.initialPosition ?? 0);
  const latest = useRef<{ position: number; percent: number } | null>(null);
  const finished = useRef(false);
  const [error, setError] = useState(false);
  const id = extractYoutubeId(props.url);
  const html = useMemo(() => {
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return '';
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;background:#000"><div id="lesson"></div><script>
      var player;
      function report(ended) {
        if (!player || !player.getDuration) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ position:player.getCurrentTime(), duration:player.getDuration(), ended:!!ended }));
      }
      function onYouTubeIframeAPIReady() {
        player = new YT.Player('lesson', { width:'100%', height:'250', videoId:'${id}',
          playerVars:{playsinline:1,start:${Math.max(0, Math.floor(initial.current))},origin:'https://lms.smwebsystems.com'},
          events:{onStateChange:function(event){ if(event.data===0 || event.data===2) report(event.data===0); },
            onError:function(){window.ReactNativeWebView.postMessage(JSON.stringify({error:true}));}} });
      }
      setInterval(function(){if(player && player.getPlayerState && player.getPlayerState()===1) report(false);},10000);
      </script><script src="https://www.youtube.com/iframe_api"></script></body></html>`;
  }, [id]);
  useEffect(() => {
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        web.current?.injectJavaScript('if (typeof player !== "undefined" && player && player.pauseVideo) { player.pauseVideo(); report(false); } true;');
        if (latest.current) callbacks.current.onProgress(latest.current.position, latest.current.percent);
      }
    });
    return () => { app.remove(); if (latest.current) callbacks.current.onProgress(latest.current.position, latest.current.percent); };
  }, []);
  if (!html || Platform.OS === 'web') return <Text>Use the video link below to watch this lesson.</Text>;
  return <View className="gap-2">
    <WebView ref={web} source={{ html, baseUrl: 'https://lms.smwebsystems.com' }} style={{ height: 250 }} allowsInlineMediaPlayback allowsFullscreenVideo
      onError={() => setError(true)} onHttpError={() => setError(true)}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.error) { setError(true); return; }
          if (typeof data.position !== 'number' || typeof data.duration !== 'number' || !Number.isFinite(data.position) || !Number.isFinite(data.duration) || data.duration <= 0 || data.position < 0) return;
          const position = Math.floor(data.position);
          const percent = Math.min(100, Math.floor(data.position / data.duration * 100));
          latest.current = { position, percent };
          callbacks.current.onProgress(position, percent);
          if (data.ended === true && !finished.current) { finished.current = true; callbacks.current.onComplete(); }
        } catch { /* Ignore messages that are not playback status. */ }
      }} />
    {error ? <ErrorBanner message="This video could not load here. Use the video link below." /> : null}
  </View>;
}
