import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { submissionsService } from '@/services/submissionsService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import type { Submission, NativeFile } from '@/types/api';
import { formatDate, formatFileSize } from '@/utils/format';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

export default function SubmissionsScreen() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<NativeFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await submissionsService.getAll({ limit: 100 });
      setSubmissions(res.submissions);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load submissions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setFile(null);
    setSubmitError(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
        size: asset.size,
      });
      setSubmitError(null);
    } catch (e) {
      Alert.alert('Could not pick file', getErrorMessage(e, 'Please try again.'));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setSubmitError('Please enter a title.');
      return;
    }
    if (!file) {
      setSubmitError('Please select a file to upload.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submissionsService.create({
        title: title.trim(),
        description: description.trim(),
        file,
      });
      closeModal();
      await load();
    } catch (e) {
      setSubmitError(getErrorMessage(e, 'Could not submit your work.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (submission: Submission) => {
    try {
      setDownloadingId(submission.id);
      await submissionsService.download(submission.id);
    } catch (e) {
      Alert.alert('Download failed', getErrorMessage(e, 'Could not download the file.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete submission', 'Are you sure you want to delete this submission?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await submissionsService.delete(id);
            await load();
          } catch (e) {
            Alert.alert('Error', getErrorMessage(e, 'Could not delete the submission.'));
          }
        },
      },
    ]);
  };

  if (loading && !refreshing) return <LoadingView message="Loading submissions…" />;

  return (
    <>
      <ScrollView
        className="flex-1 bg-neutral-50"
        contentContainerClassName="p-4 gap-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent.teal} />}
        keyboardShouldPersistTaps="handled">
        <View className="gap-3">
          <View>
            <Text className="text-2xl font-bold text-neutral-900">My Submissions</Text>
            <Text className="mt-1 text-sm text-neutral-500">Upload assignments and track review status</Text>
          </View>
          <Button
            label="New submission"
            fullWidth
            leftIcon={<Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
            onPress={() => setModalOpen(true)}
          />
        </View>

        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        {submissions.length === 0 ? (
          <EmptyState
            icon="cloud-upload-outline"
            title="No submissions yet"
            message='Tap "New submission" to upload your first assignment.'
          />
        ) : (
          submissions.map((s) => (
            <Card key={s.id}>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-bold text-neutral-900">{s.title}</Text>
                  {s.description ? (
                    <Text className="mt-1 text-sm text-neutral-600" numberOfLines={3}>
                      {s.description}
                    </Text>
                  ) : null}
                </View>
                <StatusBadge status={s.status} />
              </View>

              <View className="mt-3 flex-row items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2">
                <Ionicons name="document-outline" size={16} color={brand.neutral[400]} />
                <View className="flex-1">
                  <Text className="text-sm text-neutral-800" numberOfLines={1}>
                    {s.fileName}
                  </Text>
                  <Text className="text-xs text-neutral-400">
                    {formatFileSize(s.fileSize)} · {formatDate(s.submittedAt)}
                  </Text>
                </View>
              </View>

              {s.feedback ? (
                <View className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
                  <Text className="text-xs font-semibold text-amber-800">Instructor feedback</Text>
                  <Text className="mt-1 text-sm text-amber-900">{s.feedback}</Text>
                </View>
              ) : null}

              <View className="mt-3 flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label={downloadingId === s.id ? 'Downloading…' : 'Download'}
                    variant="outline"
                    size="sm"
                    disabled={downloadingId === s.id}
                    onPress={() => handleDownload(s)}
                  />
                </View>
                {s.status === 'pending' ? (
                  <View className="flex-1">
                    <Button label="Delete" variant="outline" size="sm" onPress={() => handleDelete(s.id)} />
                  </View>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
            <ScrollView
              className="flex-1"
              contentContainerClassName="p-4 gap-4 pb-8"
              keyboardShouldPersistTaps="handled">
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-bold text-neutral-900">New submission</Text>
                <Pressable onPress={closeModal} hitSlop={12} accessibilityLabel="Close">
                  <Ionicons name="close" size={24} color={brand.primary.dark} />
                </Pressable>
              </View>

              <Input label="Title" value={title} onChangeText={setTitle} placeholder="Assignment title" />
              <Input
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="Optional notes for your instructor"
                multiline
                className="min-h-[96px]"
                textAlignVertical="top"
              />

              <View>
                <Text className="mb-2 text-sm font-medium text-neutral-700">File</Text>
                <Pressable
                  onPress={pickFile}
                  className="items-center rounded-xl border border-dashed border-neutral-300 bg-white p-6 active:opacity-80">
                  <Ionicons name="document-attach-outline" size={32} color={brand.accent.teal} />
                  <Text className="mt-2 text-center font-semibold text-neutral-800">
                    {file ? file.name : 'Tap to select a file'}
                  </Text>
                  <Text className="mt-1 text-center text-xs text-neutral-400">PDF, DOC, DOCX, ZIP, or TXT</Text>
                  {file?.size ? <Text className="mt-1 text-xs text-neutral-500">{formatFileSize(file.size)}</Text> : null}
                </Pressable>
              </View>

              {submitError ? <ErrorBanner message={submitError} /> : null}

              <Button label={submitting ? 'Submitting…' : 'Submit work'} onPress={handleSubmit} disabled={submitting} loading={submitting} />
              <Button label="Cancel" variant="outline" onPress={closeModal} disabled={submitting} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
