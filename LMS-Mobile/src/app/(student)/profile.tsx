import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, Linking } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { profileService } from '@/services/profileService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';
import type { NativeFile } from '@/types/api';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileScreen() {
  const { user, updateUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    try {
      const profile = await profileService.get(user.id);
      setDisplayName(profile.displayName ?? user.name ?? '');
      setDescription(profile.description ?? '');
      setAvatarUrl(profile.avatarUrl ?? null);
      setLinkedinUrl(profile.linkedinUrl ?? '');
      setWebsiteUrl(profile.websiteUrl ?? '');
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load your profile.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.name]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to update your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const file: NativeFile = {
      uri: asset.uri,
      name: asset.fileName || `avatar-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
      size: asset.fileSize,
    };

    setAvatarUploading(true);
    try {
      const url = await profileService.uploadAvatar(file);
      if (url) setAvatarUrl(url);
    } catch (e) {
      Alert.alert('Upload failed', getErrorMessage(e, 'Could not update your photo.'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const updated = await profileService.save(user.id, {
        displayName: displayName.trim() || undefined,
        description: description.trim() || undefined,
        linkedinUrl: linkedinUrl.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
      });
      updateUser({ ...user, name: updated.displayName ?? user.name });
      setSaveMessage('Profile saved.');
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 px-6">
        <Text className="text-neutral-600">Sign in to view your profile.</Text>
      </View>
    );
  }

  if (loading && !refreshing) return <LoadingView message="Loading profile…" />;

  const shownName = displayName.trim() || user.name;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerClassName="p-4 gap-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent.teal} />}
      keyboardShouldPersistTaps="handled">
      <Card>
        <View className="items-center py-2">
          <Pressable onPress={pickAvatar} className="relative">
            <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary-50">
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: 96, height: 96 }} contentFit="cover" />
              ) : (
                <Text className="text-2xl font-bold text-primary-dark">{initials(shownName)}</Text>
              )}
            </View>
            <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full bg-accent-teal">
              <Ionicons name="camera-outline" size={16} color="#fff" />
            </View>
          </Pressable>
          <Text className="mt-3 text-xl font-bold text-neutral-900">{shownName}</Text>
          <Text className="text-sm text-neutral-500">{user.email}</Text>
          <Text className="mt-1 text-xs capitalize text-neutral-400">{user.role}</Text>
          {avatarUploading ? <Text className="mt-2 text-xs text-neutral-500">Uploading photo…</Text> : null}
        </View>
      </Card>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {saveMessage ? (
        <View className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Text className="text-sm font-medium text-emerald-900">{saveMessage}</Text>
        </View>
      ) : null}

      <Card>
        <CardTitle className="mb-3">About you</CardTitle>
        <Input label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
        <Input
          label="Bio"
          value={description}
          onChangeText={setDescription}
          placeholder="Tell classmates a little about yourself"
          multiline
          className="min-h-[96px]"
          textAlignVertical="top"
        />
      </Card>

      <Card>
        <CardTitle className="mb-3">Links</CardTitle>
        <Input label="LinkedIn" value={linkedinUrl} onChangeText={setLinkedinUrl} placeholder="linkedin.com/in/you" autoCapitalize="none" />
        <Input label="Website" value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="your-site.com" autoCapitalize="none" />
        {websiteUrl.trim() ? (
          <Pressable onPress={() => Linking.openURL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)} className="mt-2">
            <Text className="text-sm font-semibold text-accent-teal">Preview website link</Text>
          </Pressable>
        ) : null}
      </Card>

      <Button label={saving ? 'Saving…' : 'Save profile'} onPress={handleSave} disabled={saving} loading={saving} />
      <Button label="Sign out" variant="outline" onPress={logout} />
    </ScrollView>
  );
}
