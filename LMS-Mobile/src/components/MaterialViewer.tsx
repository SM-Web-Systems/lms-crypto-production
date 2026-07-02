import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import type { CourseItem, CourseSection } from '@/types/course';
import { documentsService } from '@/services/documentsService';
import { getAuthToken } from '@/lib/api';
import { getIframeVideoEmbedSrc, isDirectVideoFileUrl, extractYoutubeId } from '@/utils/mediaUrl';
import { brand } from '@/theme/colors';

function DirectVideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: 220, borderRadius: 12 }}
      contentFit="contain"
      nativeControls
    />
  );
}

function AuthenticatedPdfViewer({ documentId }: { documentId: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAuthToken();
      if (cancelled) return;
      setPdfUrl(documentsService.getDownloadUrl(documentId));
      if (token) setHeaders({ Authorization: `Bearer ${token}` });
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (!pdfUrl) return null;
  return <WebView source={{ uri: pdfUrl, headers }} style={{ height: 400, borderRadius: 12 }} />;
}

export function MaterialViewer({
  section,
  item,
  onClose,
}: {
  section: CourseSection;
  item: CourseItem;
  onClose: () => void;
}) {
  const openExternal = (url: string) => Linking.openURL(url);

  let content: React.ReactNode = null;

  if (item.type === 'video') {
    const url = item.url.trim();
    if (isDirectVideoFileUrl(url)) {
      content = <DirectVideoPlayer url={url} />;
    } else {
      content = (
        <WebView source={{ uri: getIframeVideoEmbedSrc(url) }} style={{ height: 220, borderRadius: 12 }} allowsFullscreenVideo />
      );
    }
  } else if (item.type === 'link') {
    content = (
      <Pressable onPress={() => openExternal(item.url)} className="items-center rounded-xl border border-neutral-200 bg-white p-6">
        <Ionicons name="open-outline" size={28} color={brand.accent.teal} />
        <Text className="mt-3 text-center font-semibold text-neutral-900">{item.title}</Text>
        <Text className="mt-2 text-sm text-accent-teal">Open link</Text>
      </Pressable>
    );
  } else if (item.type === 'pdf') {
    if (item.documentId) {
      content = <AuthenticatedPdfViewer documentId={item.documentId} />;
    } else if (item.fileUrl?.trim()) {
      content = <WebView source={{ uri: item.fileUrl.trim() }} style={{ height: 400, borderRadius: 12 }} />;
    }
  }

  return (
    <View className="gap-4">
      <Pressable
        onPress={onClose}
        className="flex-row items-center gap-2 self-start rounded-lg border border-neutral-200 bg-white px-3 py-2">
        <Ionicons name="arrow-back" size={16} color={brand.primary.dark} />
        <Text className="text-sm font-semibold text-neutral-800">Back to materials</Text>
      </Pressable>
      <View>
        <Text className="text-xs uppercase tracking-wide text-neutral-400">{section.title}</Text>
        <Text className="mt-1 text-xl font-bold text-neutral-900">{item.title}</Text>
        {item.information ? <Text className="mt-2 text-sm text-neutral-600">{item.information}</Text> : null}
        {'description' in item && item.description ? (
          <Text className="mt-1 text-sm text-neutral-500">{item.description}</Text>
        ) : null}
      </View>
      {content}
      {item.type === 'pdf' && item.documentId ? (
        <Pressable
          onPress={() => documentsService.download(item.documentId!, item.title).catch(() => undefined)}
          className="flex-row items-center justify-center gap-2 rounded-lg bg-accent-teal py-3">
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text className="font-semibold text-white">Download PDF</Text>
        </Pressable>
      ) : null}
      {item.type === 'video' && extractYoutubeId(item.url) ? (
        <Pressable onPress={() => openExternal(item.url)} className="flex-row items-center justify-center gap-2 py-2">
          <Ionicons name="logo-youtube" size={18} color={brand.accent.teal} />
          <Text className="text-sm font-semibold text-accent-teal">Open in YouTube</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
