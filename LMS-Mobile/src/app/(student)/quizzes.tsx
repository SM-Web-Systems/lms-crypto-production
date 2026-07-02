import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { quizService } from '@/services/quizService';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import type { Quiz, QuizCompletion, QuizQuestion } from '@/types/quiz';
import { getErrorMessage } from '@/utils/apiError';
import { brand } from '@/theme/colors';

type Step = 'list' | 'intro' | 'take' | 'result';

function sortedQuestions(quiz: Quiz): QuizQuestion[] {
  return [...(quiz.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export default function QuizzesScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [step, setStep] = useState<Step>('list');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [completions, setCompletions] = useState<Record<string, QuizCompletion | null>>({});
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lastResult, setLastResult] = useState<QuizCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await quizService.getAll();
        if (cancelled) return;
        setQuizzes(list);
        const comps: Record<string, QuizCompletion | null> = {};
        await Promise.all(
          list.map(async (q) => {
            try {
              comps[q.id] = await quizService.getCompletion(q.id, userId);
            } catch {
              comps[q.id] = null;
            }
          })
        );
        if (!cancelled) setCompletions(comps);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, 'Could not load quizzes.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const questions = useMemo(() => (activeQuiz ? sortedQuestions(activeQuiz) : []), [activeQuiz]);
  const currentQ = questions[questionIndex];

  const openIntro = (quiz: Quiz) => {
    setActiveQuiz(quiz);
    setAnswers({});
    setQuestionIndex(0);
    setLastResult(null);
    setSubmitError(null);
    setStep('intro');
  };

  const backToList = () => {
    setActiveQuiz(null);
    setStep('list');
    setAnswers({});
    setLastResult(null);
  };

  const submitQuiz = async () => {
    if (!activeQuiz) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await quizService.submitQuiz(activeQuiz.id, answers);
      setLastResult(result);
      setCompletions((prev) => ({ ...prev, [activeQuiz.id]: result }));
      setStep('result');
    } catch (e) {
      setSubmitError(getErrorMessage(e, 'Could not submit your answers.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingView message="Loading quizzes…" />;

  if (step === 'intro' && activeQuiz) {
    const prev = completions[activeQuiz.id];
    return (
      <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-4">
        <Pressable onPress={backToList} className="flex-row items-center gap-2">
          <Ionicons name="arrow-back" size={18} color={brand.primary.dark} />
          <Text className="font-semibold text-neutral-800">All quizzes</Text>
        </Pressable>
        <Card>
          <CardTitle>{activeQuiz.title}</CardTitle>
          {activeQuiz.description ? <Text className="mt-2 text-sm text-neutral-600">{activeQuiz.description}</Text> : null}
          {activeQuiz.information ? <Text className="mt-2 text-sm text-neutral-500">{activeQuiz.information}</Text> : null}
          <Text className="mt-3 text-sm text-neutral-500">
            {questions.length} question{questions.length === 1 ? '' : 's'} · Pass score: {activeQuiz.passingScore ?? 70}%
          </Text>
          {prev ? (
            <View className="mt-3 rounded-lg bg-neutral-100 p-3">
              <Text className="text-sm text-neutral-700">
                Previous: {prev.score}/{prev.total} ({prev.passed ? 'Passed' : 'Not passed'})
              </Text>
            </View>
          ) : null}
          <View className="mt-4">
            <Button label="Start quiz" onPress={() => setStep('take')} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  if (step === 'take' && activeQuiz && currentQ) {
    return (
      <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-4 pb-8">
        <Text className="text-sm text-neutral-500">
          Question {questionIndex + 1} of {questions.length}
        </Text>
        <Card>
          <Text className="text-lg font-bold text-neutral-900">{currentQ.question}</Text>
          {currentQ.information ? <Text className="mt-2 text-sm text-neutral-500">{currentQ.information}</Text> : null}
          {currentQ.type === 'multiple_choice' && currentQ.options ? (
            <View className="mt-4 gap-2">
              {currentQ.options.map((opt, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: opt }))}
                  className={`rounded-xl border p-3 ${answers[currentQ.id] === opt ? 'border-accent-teal bg-accent-teal/10' : 'border-neutral-200 bg-white'}`}>
                  <Text className="text-sm text-neutral-800">{opt}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View className="mt-4">
              <Input
                label="Your answer"
                value={answers[currentQ.id] ?? ''}
                onChangeText={(v) => setAnswers((prev) => ({ ...prev, [currentQ.id]: v }))}
                placeholder="Type your answer"
              />
            </View>
          )}
        </Card>
        {submitError ? <ErrorBanner message={submitError} /> : null}
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button label="Previous" variant="outline" onPress={() => setQuestionIndex((i) => Math.max(0, i - 1))} disabled={questionIndex === 0} />
          </View>
          {questionIndex < questions.length - 1 ? (
            <View className="flex-1">
              <Button label="Next" onPress={() => setQuestionIndex((i) => i + 1)} />
            </View>
          ) : (
            <View className="flex-1">
              <Button label={submitting ? 'Submitting…' : 'Submit'} onPress={submitQuiz} disabled={submitting} />
            </View>
          )}
        </View>
        <Button label="Back to intro" variant="outline" onPress={() => setStep('intro')} />
      </ScrollView>
    );
  }

  if (step === 'result' && activeQuiz && lastResult) {
    return (
      <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-4">
        <Card>
          <View className="items-center py-4">
            <Ionicons
              name={lastResult.passed ? 'checkmark-circle' : 'close-circle'}
              size={48}
              color={lastResult.passed ? '#059669' : '#dc2626'}
            />
            <Text className="mt-3 text-xl font-bold text-neutral-900">{lastResult.passed ? 'You passed!' : 'Keep practicing'}</Text>
            <Text className="mt-2 text-neutral-600">
              Score: {lastResult.score}/{lastResult.total}
            </Text>
          </View>
          <Button label="Back to quizzes" onPress={backToList} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50" contentContainerClassName="p-4 gap-3 pb-8">
      {error ? <ErrorBanner message={error} /> : null}
      {quizzes.length === 0 ? (
        <EmptyState icon="clipboard-outline" title="No quizzes yet" message="Quizzes will appear here when your instructor adds them." />
      ) : (
        quizzes.map((quiz) => {
          const completion = completions[quiz.id];
          return (
            <Pressable key={quiz.id} onPress={() => openIntro(quiz)} className="rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-90">
              <Text className="text-lg font-bold text-neutral-900">{quiz.title}</Text>
              {quiz.description ? <Text className="mt-1 text-sm text-neutral-600">{quiz.description}</Text> : null}
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-xs text-neutral-400">{quiz.questions?.length ?? 0} questions</Text>
                {completion ? (
                  <View className={`rounded-full px-2 py-1 ${completion.passed ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    <Text className={`text-xs font-semibold ${completion.passed ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {completion.score}/{completion.total}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-xs font-semibold text-accent-teal">Not taken</Text>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
