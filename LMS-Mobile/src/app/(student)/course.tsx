import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { courseService } from '@/services/courseService';
import { MaterialViewer } from '@/components/MaterialViewer';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { getCourseWeeks, type Course, type CourseItem, type CourseSection } from '@/types/course';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

export default function CourseScreen() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<{ section: CourseSection; item: CourseItem } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await courseService.fetchCourses();
      setCourses(list);
      if (list.length === 1 && !selectedCourse) {
        setSelectedCourse(list[0]);
        const weeks = getCourseWeeks(list[0]);
        if (weeks[0]) setSelectedWeekId(weeks[0].id);
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load courses.'));
    } finally {
      setLoading(false);
    }
  }, [selectedCourse]);

  useEffect(() => {
    load();
  }, [load]);

  const weeks = useMemo(() => (selectedCourse ? getCourseWeeks(selectedCourse) : []), [selectedCourse]);
  const activeWeek = weeks.find((w) => w.id === selectedWeekId) ?? weeks[0] ?? null;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading && !refreshing) return <LoadingView message="Loading courses…" />;

  if (selectedMaterial) {
    return (
      <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4">
        <MaterialViewer
          section={selectedMaterial.section}
          item={selectedMaterial.item}
          onClose={() => setSelectedMaterial(null)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50"
      contentContainerClassName="p-4 gap-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent.teal} />}>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {!selectedCourse ? (
        <>
          <Text className="text-lg font-bold text-neutral-900">Your courses</Text>
          {courses.length === 0 ? (
            <EmptyState icon="book-outline" title="No courses yet" message="Courses will appear here once you're enrolled." />
          ) : (
            courses.map((course) => (
              <Pressable
                key={course.id}
                onPress={() => {
                  setSelectedCourse(course);
                  const w = getCourseWeeks(course);
                  setSelectedWeekId(w[0]?.id ?? null);
                }}
                className="rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-90">
                <Text className="text-lg font-bold text-neutral-900">{course.title}</Text>
                {course.description ? <Text className="mt-1 text-sm text-neutral-600">{course.description}</Text> : null}
                <View className="mt-3 flex-row items-center gap-1">
                  <Text className="text-sm font-semibold text-accent-teal">Open course</Text>
                  <Ionicons name="chevron-forward" size={16} color={brand.accent.teal} />
                </View>
              </Pressable>
            ))
          )}
        </>
      ) : (
        <>
          <Pressable
            onPress={() => {
              if (courses.length > 1) {
                setSelectedCourse(null);
                setSelectedWeekId(null);
              }
            }}
            className="flex-row items-center gap-2 self-start">
            {courses.length > 1 ? <Ionicons name="arrow-back" size={18} color={brand.primary.dark} /> : null}
            <Text className="text-xl font-bold text-neutral-900">{selectedCourse.title}</Text>
          </Pressable>
          {selectedCourse.description ? <Text className="text-sm text-neutral-600">{selectedCourse.description}</Text> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
            <View className="flex-row gap-2 px-1">
              {weeks.map((week) => (
                <Pressable
                  key={week.id}
                  onPress={() => setSelectedWeekId(week.id)}
                  className={`rounded-full px-4 py-2 ${selectedWeekId === week.id ? 'bg-accent-teal' : 'bg-white border border-neutral-200'}`}>
                  <Text className={`text-sm font-semibold ${selectedWeekId === week.id ? 'text-white' : 'text-neutral-700'}`}>
                    {week.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {!activeWeek || activeWeek.sections.length === 0 ? (
            <EmptyState icon="folder-open-outline" title="No materials yet" message="This week has no content yet." />
          ) : (
            activeWeek.sections.map((section) => (
              <View key={section.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <Text className="font-bold text-neutral-900">{section.title}</Text>
                {section.objective ? <Text className="mt-1 text-sm text-neutral-500">{section.objective}</Text> : null}
                <View className="mt-3 gap-2">
                  {[...section.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedMaterial({ section, item })}
                      className="flex-row items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 active:opacity-80">
                      <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                        <Ionicons
                          name={item.type === 'video' ? 'play-circle-outline' : item.type === 'pdf' ? 'document-text-outline' : 'link-outline'}
                          size={20}
                          color={brand.accent.teal}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="font-medium text-neutral-900">{item.title}</Text>
                        <Text className="text-xs capitalize text-neutral-400">{item.type}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={brand.neutral[400]} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}
