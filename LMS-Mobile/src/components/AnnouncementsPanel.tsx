import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { announcementService, type Announcement } from '@/services/announcementService';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatDate } from '@/utils/format';
import { brand } from '@/theme/colors';

export function AnnouncementsPanel() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    announcementService
      .getAll()
      .then((list) => {
        if (!cancelled) setAnnouncements(list.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setAnnouncements([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || announcements.length === 0) return null;

  return (
    <Card>
      <CardTitle className="mb-3">Announcements</CardTitle>
      <View className="gap-3">
        {announcements.map((a) => (
          <View key={a.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <View className="flex-row items-start gap-2">
              {a.pinned ? <Ionicons name="pin" size={14} color={brand.accent.teal} /> : null}
              <View className="flex-1">
                <Text className="font-semibold text-neutral-900">{a.title}</Text>
                <Text className="mt-1 text-sm text-neutral-600">{a.body}</Text>
                <Text className="mt-2 text-xs text-neutral-400">
                  {a.authorName} · {formatDate(a.createdAt)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
