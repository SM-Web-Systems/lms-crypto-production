import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { documentsService } from '@/services/documentsService';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import type { CourseDocument } from '@/types/api';
import { formatDate, formatFileSize } from '@/utils/format';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

export default function DocumentsScreen() {
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params: { search?: string; category?: string } = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedCategory) params.category = selectedCategory;
      const res = await documentsService.getAll(params);
      setDocuments(res.documents);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load documents.'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory]);

  useEffect(() => {
    documentsService.getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleDownload = async (doc: CourseDocument) => {
    try {
      setDownloadingId(doc.id);
      await documentsService.download(doc.id, doc.fileName);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not download file.'));
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) return <LoadingView message="Loading resources…" />;

  return (
    <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-4 pb-8">
      <View>
        <Text className="text-xl font-bold text-neutral-900">Resources</Text>
        <Text className="text-sm text-neutral-500">Course documents and learning materials</Text>
      </View>

      <Input value={searchTerm} onChangeText={setSearchTerm} placeholder="Search documents…" />

      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setSelectedCategory('')}
              className={`rounded-full px-4 py-2 ${!selectedCategory ? 'bg-accent-teal' : 'bg-white border border-neutral-200'}`}>
              <Text className={`text-sm font-semibold ${!selectedCategory ? 'text-white' : 'text-neutral-700'}`}>All</Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-2 ${selectedCategory === cat ? 'bg-accent-teal' : 'bg-white border border-neutral-200'}`}>
                <Text className={`text-sm font-semibold ${selectedCategory === cat ? 'text-white' : 'text-neutral-700'}`}>{cat}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {documents.length === 0 ? (
        <EmptyState icon="library-outline" title="No documents found" message="Resources will appear here when uploaded by your instructor." />
      ) : (
        documents.map((doc) => (
          <Card key={doc.id}>
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-red-50">
                <Ionicons name="document-text-outline" size={22} color="#dc2626" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-neutral-900">{doc.title}</Text>
                {doc.description ? <Text className="mt-1 text-sm text-neutral-600">{doc.description}</Text> : null}
                <Text className="mt-2 text-xs text-neutral-400">
                  {doc.category} · {formatFileSize(doc.fileSize)} · {formatDate(doc.uploadedAt)}
                </Text>
              </View>
              <Pressable onPress={() => handleDownload(doc)} disabled={downloadingId === doc.id}>
                <Ionicons
                  name={downloadingId === doc.id ? 'hourglass-outline' : 'download-outline'}
                  size={24}
                  color={brand.accent.teal}
                />
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
