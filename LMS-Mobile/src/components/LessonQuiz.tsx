import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { quizService } from '../services/quizService';
import type { Quiz, QuizCompletion } from '../types/quiz';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ErrorBanner } from './ErrorBanner';
import { getErrorMessage } from '../utils/apiError';

export function LessonQuiz({ quizId, courseId, onSubmitted }: { quizId: string; courseId: string; onSubmitted: () => void }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizCompletion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    quizService.getById(quizId).then((value) => {
      if (cancelled) return;
      if (!value || value.courseId !== courseId) throw new Error('This lesson quiz is unavailable. Please contact your instructor.');
      setQuiz(value);
    }).catch((error) => { if (!cancelled) setError(getErrorMessage(error, 'Could not load quiz.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [quizId, courseId, attempt]);

  const submit = async () => {
    if (!quiz || saving) return;
    setSaving(true); setError(null);
    try {
      setResult(await quizService.submitQuiz(quiz.id, answers));
      onSubmitted(); // The server decides whether the linked lesson is complete.
    } catch (error) { setError(getErrorMessage(error, 'Could not submit your answers.')); }
    finally { setSaving(false); }
  };
  if (loading) return <Text>Loading quiz…</Text>;
  if (!quiz) return <ErrorBanner message={error || 'This quiz has not been configured yet.'} onRetry={() => setAttempt((v) => v + 1)} />;
  return <View className="gap-4">
    <Text className="font-bold text-neutral-900">{quiz.title}</Text>
    <Text>Pass score: {quiz.passingScore ?? 70}%</Text>
    {result ? <>
      <Text accessibilityRole="alert">{result.passed ? 'You passed!' : 'Not passed yet'} Score: {result.score}/{result.total}</Text>
      {!result.passed ? <Button label="Try quiz again" onPress={() => setResult(null)} /> : null}
    </> : <>
      {[...quiz.questions].sort((a, b) => a.order - b.order).map((question) => <View key={question.id} className="gap-2">
        <Text className="font-semibold">{question.question}</Text>
        {question.information ? <Text>{question.information}</Text> : null}
        {question.type === 'multiple_choice' && question.options ? question.options.map((option, index) => <Pressable
          key={index} accessibilityRole="radio" accessibilityState={{ checked: answers[question.id] === option }}
          onPress={() => setAnswers((old) => ({ ...old, [question.id]: option }))}
          className={`rounded-lg border p-3 ${answers[question.id] === option ? 'border-accent-teal bg-primary-50' : 'border-neutral-200'}`}>
          <Text>{option}</Text>
        </Pressable>) : <Input label="Your answer" accessibilityLabel={`Your answer: ${question.question}`} value={answers[question.id] || ''} onChangeText={(value) => setAnswers((old) => ({ ...old, [question.id]: value }))} />}
      </View>)}
      <Button label={saving ? 'Submitting…' : 'Submit quiz'} disabled={saving || !quiz.questions.length || quiz.questions.some((q) => !answers[q.id]?.trim())} onPress={submit} />
    </>}
    {error ? <ErrorBanner message={error} /> : null}
  </View>;
}
