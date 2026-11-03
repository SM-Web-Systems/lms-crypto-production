import { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { submissionsService } from '../services/submissionsService';
import type { CourseItemAssignment } from '../types/course';
import type { NativeFile, Submission } from '../types/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ErrorBanner } from './ErrorBanner';
import { getErrorMessage } from '../utils/apiError';

export function LessonAssignment({ courseId, weekId, item, onSubmitted }: { courseId: string; weekId?: string; item: CourseItemAssignment; onSubmitted: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<NativeFile | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      // Fetch every page so older submissions for this lesson remain visible.
      const rows: Submission[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await submissionsService.getAll({ courseId, view: 'own', page, limit: 100 });
        rows.push(...response.submissions.filter((submission) => submission.itemId === item.id));
        totalPages = response.pagination.totalPages;
        page++;
      } while (page <= totalPages);
      setSubmissions(rows);
      setError(null);
    } catch (error) { setError(getErrorMessage(error, 'Could not load assignment submissions.')); }
  }, [courseId, item.id]);
  useEffect(() => { void load(); }, [load]);
  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: item.allowedMimeTypes?.length ? item.allowedMimeTypes : '*/*' });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (item.maxFileSize && (asset.size === undefined || asset.size > item.maxFileSize)) throw new Error('The file exceeds the assignment size limit or its size could not be checked.');
      if (item.allowedMimeTypes?.length && !item.allowedMimeTypes.includes(asset.mimeType || '')) throw new Error('This file type is not accepted for this assignment.');
      setFile({ uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream', size: asset.size });
      setError(null);
    } catch (error) { setError(getErrorMessage(error, 'Could not select a file.')); }
  };
  const submit = async () => {
    if (!file || busy) return;
    setBusy(true); setError(null);
    try {
      const created = await submissionsService.create({ courseId, weekId, itemId: item.id, title: title.trim(), description: description.trim() || `Assignment: ${item.title}`, file });
      setSubmissions((old) => [created, ...old]);
      setFile(null);
      onSubmitted();
    } catch (error) { setError(getErrorMessage(error, 'Could not submit your assignment.')); }
    finally { setBusy(false); }
  };
  return <View className="gap-3">
    <Text>Submit your work for this lesson. Completion is awarded after instructor approval.</Text>
    {submissions.map((submission) => <View key={submission.id} className="rounded-lg border border-neutral-200 p-3">
      <Text>{submission.title} · {submission.status}</Text>
      {submission.feedback ? <Text>Feedback: {submission.feedback}</Text> : null}
    </View>)}
    <Button label="Refresh assignment status" variant="outline" onPress={() => { void load(); onSubmitted(); }} />
    <Input label="Submission title" accessibilityLabel="Submission title" value={title} onChangeText={setTitle} maxLength={200} />
    <Input label="Notes for your instructor" accessibilityLabel="Notes for your instructor" value={description} onChangeText={setDescription} maxLength={1000} multiline />
    {file ? <Text>{file.name}</Text> : null}
    <Button label="Choose assignment file" variant="outline" onPress={pick} disabled={busy} />
    <Button label={busy ? 'Submitting…' : 'Submit assignment'} onPress={submit} disabled={busy || !file || !title.trim()} />
    {error ? <ErrorBanner message={error} onRetry={load} /> : null}
  </View>;
}
