import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import Input, { TextArea } from '../components/Input';
import { quizService } from '../services/quizService';
import { courseService } from '../services/courseService';
import type { Quiz, QuizQuestion } from '../types/quiz';
import type { Course } from '../types/course';
import {
  ClipboardList,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  Loader2,
  GripVertical,
  AlertCircle,
  Download,
  FileSpreadsheet,
  Upload,
  X,
  LayoutGrid,
  Eye,
} from 'lucide-react';
import { ApiRequestError, getErrorMessage } from '../utils/apiError';
import { AdminQuizPreview } from '../components/AdminQuizPreview';

function newTempId(): string {
  return 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

type QuestionDraft = {
  tempId: string;
  type: 'multiple_choice' | 'short_answer' | 'flashcard';
  question: string;
  information: string;
  options: string[];
  correctIndex: number;
  correctAnswer: string;
  order: number;
};

// ─── CSV helpers ────────────────────────────────────────────────────────────

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const CSV_TEMPLATE_HEADER = 'type,question,information,option_a,option_b,option_c,option_d,correct';
const CSV_TEMPLATE_ROWS = [
  'multiple_choice,What is a blockchain?,Read chapter 1 before answering.,A distributed ledger,A type of currency,A programming language,A centralised database,A',
  'flashcard,Which consensus mechanism is used by Bitcoin?,,Proof of Work,Proof of Stake,Delegated Proof of Stake,Proof of Authority,A',
  'short_answer,What does DeFi stand for?,,,,,,Decentralized Finance',
  'multiple_choice,Who created Bitcoin?,,Satoshi Nakamoto,Vitalik Buterin,Elon Musk,Craig Wright,A',
];
const CSV_TEMPLATE = [CSV_TEMPLATE_HEADER, ...CSV_TEMPLATE_ROWS].join('\n');

function downloadQuizTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'quiz-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportQuizToCSV(quizTitle: string, questions: QuestionDraft[]) {
  const rows = [CSV_TEMPLATE_HEADER];
  for (const q of questions) {
    const opts = q.options.slice(0, 6);
    while (opts.length < 4) opts.push('');
    const correctCell =
      q.type === 'short_answer'
        ? q.correctAnswer
        : OPTION_LETTERS[q.correctIndex] ?? 'A';
    rows.push(csvRow([q.type, q.question, q.information, ...opts, correctCell]));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${quizTitle.trim().replace(/\s+/g, '-').toLowerCase() || 'quiz'}-export.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${(f ?? '').replace(/"/g, '""')}"`).join(',');
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

type ParsedCSV = { questions: QuestionDraft[]; errors: string[] };

function parseQuizCSV(raw: string): ParsedCSV {
  const errors: string[] = [];
  const questions: QuestionDraft[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { questions: [], errors: ['CSV is empty or has no data rows.'] };

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const typeIdx = header.indexOf('type');
  const qIdx = header.indexOf('question');
  const infoIdx = header.indexOf('information');
  const correctIdx = header.indexOf('correct');

  if (typeIdx < 0 || qIdx < 0 || correctIdx < 0) {
    return { questions: [], errors: ['CSV must have "type", "question", and "correct" columns.'] };
  }

  // Collect option columns (option_a, option_b, option_c, …)
  const optionIndices: number[] = [];
  for (let i = 0; i < header.length; i++) {
    if (/^option_[a-z]$/i.test(header[i])) optionIndices.push(i);
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const type = (cols[typeIdx] ?? '').trim().toLowerCase();
    const question = (cols[qIdx] ?? '').trim();
    const information = infoIdx >= 0 ? (cols[infoIdx] ?? '').trim() : '';
    const correctRaw = (cols[correctIdx] ?? '').trim();
    const opts = optionIndices.map((oi) => (cols[oi] ?? '').trim()).filter(Boolean);

    if (!question) continue;

    if (type === 'multiple_choice' || type === 'flashcard') {
      if (opts.length < 2) {
        errors.push(`Row ${i + 1}: "${type}" needs at least 2 options (option_a, option_b…).`);
        continue;
      }
      const letterIdx = OPTION_LETTERS.findIndex((l) => l === correctRaw.toUpperCase());
      const correctIndex = letterIdx >= 0 ? letterIdx : 0;
      if (letterIdx < 0) {
        errors.push(`Row ${i + 1}: "correct" should be A/B/C/D (got "${correctRaw}"); defaulting to A.`);
      }
      questions.push({
        tempId: newTempId(),
        type: type as 'multiple_choice' | 'flashcard',
        question,
        information,
        options: opts,
        correctIndex,
        correctAnswer: '',
        order: questions.length + 1,
      });
    } else if (type === 'short_answer') {
      questions.push({
        tempId: newTempId(),
        type: 'short_answer',
        question,
        information,
        options: [],
        correctIndex: 0,
        correctAnswer: correctRaw,
        order: questions.length + 1,
      });
    } else {
      errors.push(`Row ${i + 1}: unknown type "${type}" — use multiple_choice, flashcard, or short_answer.`);
    }
  }

  return { questions, errors };
}

// ─── Component ────────────────────────────────────────────────────────────────

const AdminQuizzes: React.FC = () => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [quizInformation, setQuizInformation] = useState('');
  const [courseId, setCourseId] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview state
  const [previewQuiz, setPreviewQuiz] = useState<Quiz | null>(null);

  // CSV import state
  const [importOpen, setImportOpen] = useState(false);
  const [importParsed, setImportParsed] = useState<QuestionDraft[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const csvRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      try {
        const [quizList, courseList] = await Promise.all([
          quizService.getAll(),
          courseService.fetchCourses().catch(() => []),
        ]);
        setQuizzes(quizList);
        setCourses(courseList);
      } catch (e) {
        setLoadError(getErrorMessage(e, 'Could not load quizzes.'));
        setQuizzes([]);
        setCourses([]);
      }
    };
    load();
  }, []);

  const startNew = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setQuizInformation('');
    setCourseId('');
    setPassingScore(70);
    setQuestions([]);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const startEdit = (quiz: Quiz) => {
    setEditingId(quiz.id);
    setTitle(quiz.title);
    setDescription(quiz.description || '');
    setQuizInformation(quiz.information || '');
    setCourseId(quiz.courseId || '');
    setPassingScore(quiz.passingScore ?? 70);
    setQuestions(
      (quiz.questions || []).map((q, i) => ({
        tempId: q.id,
        type: q.type,
        question: q.question,
        information: q.information || '',
        options: q.options || [],
        correctIndex: q.correctIndex ?? 0,
        correctAnswer: q.correctAnswer || '',
        order: q.order ?? i + 1,
      }))
    );
    setShowForm(true);
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        type: 'multiple_choice',
        question: '',
        information: '',
        options: ['', ''],
        correctIndex: 0,
        correctAnswer: '',
        order: questions.length + 1,
      },
    ]);
  };

  const updateQuestion = (tempId: string, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q) => (q.tempId === tempId ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (tempId: string) => {
    setQuestions((prev) => prev.filter((q) => q.tempId !== tempId));
  };

  const setQuestionOption = (tempId: string, index: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        const opts = [...(q.options || [])];
        opts[index] = value;
        return { ...q, options: opts };
      })
    );
  };

  const addOption = (tempId: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.tempId === tempId ? { ...q, options: [...(q.options || []), ''] } : q))
    );
  };

  const removeOption = (tempId: string, index: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.tempId !== tempId) return q;
        const opts = (q.options || []).filter((_, i) => i !== index);
        return { ...q, options: opts, correctIndex: Math.min(q.correctIndex, Math.max(0, opts.length - 1)) };
      })
    );
  };

  // CSV handlers
  const openImport = () => {
    setImportParsed(null);
    setImportErrors([]);
    setImportFileName('');
    setImportOpen(true);
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const { questions: parsed, errors } = parseQuizCSV(text);
      setImportParsed(parsed.length > 0 ? parsed : null);
      setImportErrors(errors);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyImport = (mode: 'replace' | 'append') => {
    if (!importParsed) return;
    setQuestions((prev) => {
      const base = mode === 'append' ? prev : [];
      const offset = base.length;
      return [...base, ...importParsed.map((q, i) => ({ ...q, order: offset + i + 1 }))];
    });
    setImportOpen(false);
    setImportParsed(null);
    setImportErrors([]);
    setImportFileName('');
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const editingKey = editingId?.trim() || '';
      const quiz: Quiz = {
        id: editingKey || quizService.generateId(),
        title: title.trim(),
        description: description.trim() || undefined,
        information: quizInformation.trim() || undefined,
        courseId: courseId.trim() || undefined,
        passingScore: passingScore,
        questions: questions.map((q, i) => {
          const base: QuizQuestion = {
            id: q.tempId.startsWith('tmp-') ? quizService.generateId() : q.tempId,
            type: q.type,
            question: q.question.trim(),
            order: i + 1,
            ...(q.information?.trim() ? { information: q.information.trim() } : {}),
          };
          if (q.type === 'multiple_choice' || q.type === 'flashcard') {
            base.options = q.options.filter((o) => o.trim());
            base.correctIndex = q.correctIndex;
          } else {
            base.correctAnswer = q.correctAnswer.trim();
          }
          return base;
        }),
        createdAt: editingKey
          ? (quizzes.find((q) => q.id === editingKey)?.createdAt ?? new Date().toISOString())
          : new Date().toISOString(),
      };
      await quizService.save(quiz, editingKey ? 'update' : 'create');
      const list = await quizService.getAll();
      setQuizzes(list);
      closeForm();
      startNew();
    } catch (e) {
      let message = getErrorMessage(e, 'Could not save the quiz.');
      if (e instanceof ApiRequestError && e.status === 404) {
        try {
          const list = await quizService.getAll();
          setQuizzes(list);
          message = `${message} The quiz list was refreshed in case this quiz no longer exists on the server.`;
        } catch {
          /* keep existing list */
        }
      }
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this quiz? This cannot be undone.')) return;
    try {
      await quizService.delete(id);
      const list = await quizService.getAll();
      setQuizzes(list);
    } catch (e) {
      alert(getErrorMessage(e, 'Could not delete the quiz.'));
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center">
        <ClipboardList className="h-8 w-8 text-primary-600 mr-3 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Quizzes</h1>
          <p className="text-neutral-600 mt-1">Create and edit quizzes. Students can take them from the Quizzes page.</p>
        </div>
      </div>

      {loadError ? (
        <div className="mb-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not load quizzes</p>
            <p className="text-sm mt-1">{loadError}</p>
          </div>
        </div>
      ) : null}

      {!showForm ? (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <Button onClick={startNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create quiz
            </Button>
            <Button variant="outline" onClick={downloadQuizTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download CSV template
            </Button>
          </div>
          <div className="space-y-4">
            {quizzes.map((q) => (
              <Card key={q.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-800">{q.title}</h3>
                    <p className="text-sm text-neutral-500 mt-0.5">
                      {q.questions?.length ?? 0} question{(q.questions?.length ?? 0) !== 1 ? 's' : ''}
                      {q.courseId ? ` · Course: ${courses.find((c) => c.id === q.courseId)?.title ?? q.courseId}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button variant="outline" size="sm" onClick={() => setPreviewQuiz(q)}>
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => startEdit(q)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(q.id)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-semibold text-neutral-800">{editingId ? 'Edit quiz' : 'New quiz'}</h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={openImport}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Import CSV
                </Button>
                {questions.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => exportQuizToCSV(title, questions)}>
                    <Download className="h-4 w-4 mr-1" />
                    Export CSV
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={closeForm}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>

            {formError ? (
              <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            ) : null}

            <div className="space-y-6">
              <Input label="Quiz title" placeholder="e.g. Week 1 Knowledge Check" value={title} onChange={(e) => setTitle(e.target.value)} />
              <TextArea label="Description (optional)" placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              <TextArea
                label="Student information (optional)"
                placeholder="Instructions or context shown on the quiz intro (before questions), e.g. how long it takes or what to review."
                value={quizInformation}
                onChange={(e) => setQuizInformation(e.target.value)}
                rows={3}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Course (optional)</label>
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="">— None —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Passing score (%)"
                  type="number"
                  min={0}
                  max={100}
                  value={String(passingScore)}
                  onChange={(e) => setPassingScore(Number(e.target.value) || 70)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <span className="font-medium text-neutral-800">
                    Questions {questions.length > 0 ? <span className="text-neutral-500 font-normal text-sm">({questions.length})</span> : null}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add question
                  </Button>
                </div>
                {questions.length === 0 && (
                  <p className="text-sm text-neutral-500 mb-3">
                    Add questions one by one or use <strong>Import CSV</strong> to bulk-upload them.
                  </p>
                )}
                <div className="space-y-6">
                  {questions.map((q, idx) => (
                    <div key={q.tempId} className="border border-neutral-200 rounded-lg p-4 bg-neutral-50/50">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-5 w-5 text-neutral-400 mt-1 shrink-0" />
                        <div className="flex-1 space-y-3">
                          <div className="flex gap-2 items-center flex-wrap">
                            <select
                              value={q.type}
                              onChange={(e) => updateQuestion(q.tempId, { type: e.target.value as QuestionDraft['type'] })}
                              className="rounded border border-neutral-300 px-2 py-1 text-sm"
                            >
                              <option value="multiple_choice">Multiple choice</option>
                              <option value="flashcard">Flashcard grid</option>
                              <option value="short_answer">Short answer</option>
                            </select>
                            <span className="text-sm text-neutral-500">Question {idx + 1}</span>
                            {q.type === 'flashcard' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent-teal/10 border border-accent-teal/25 px-2 py-0.5 text-xs font-medium text-accent-teal">
                                <LayoutGrid className="h-3 w-3" />
                                Shown as clickable cards to students
                              </span>
                            )}
                          </div>
                          <Input
                            placeholder="Question text"
                            value={q.question}
                            onChange={(e) => updateQuestion(q.tempId, { question: e.target.value })}
                          />
                          <TextArea
                            placeholder="Optional: information for students (hint, reading, context) while they answer this question"
                            value={q.information}
                            onChange={(e) => updateQuestion(q.tempId, { information: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                          {(q.type === 'multiple_choice' || q.type === 'flashcard') && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-neutral-600">
                                Options — click the radio to mark the correct answer
                              </p>
                              {(q.options || []).map((opt, oi) => (
                                <div key={oi} className={`flex gap-2 items-center rounded-lg px-2 py-1 -mx-1 transition-colors ${q.correctIndex === oi ? 'bg-green-50 border border-green-200' : ''}`}>
                                  <input
                                    type="radio"
                                    name={`correct-${q.tempId}`}
                                    checked={q.correctIndex === oi}
                                    onChange={() => updateQuestion(q.tempId, { correctIndex: oi })}
                                    className="accent-green-600"
                                    title="Mark as correct"
                                  />
                                  <span className="text-xs font-bold text-neutral-500 w-5 shrink-0">{OPTION_LETTERS[oi]}</span>
                                  <Input
                                    placeholder={`Option ${OPTION_LETTERS[oi]}`}
                                    value={opt}
                                    onChange={(e) => setQuestionOption(q.tempId, oi, e.target.value)}
                                    className="flex-1"
                                  />
                                  <Button type="button" variant="outline" size="sm" onClick={() => removeOption(q.tempId, oi)} className="text-red-600 shrink-0">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button type="button" variant="outline" size="sm" onClick={() => addOption(q.tempId)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add option
                              </Button>
                            </div>
                          )}
                          {q.type === 'short_answer' && (
                            <Input
                              label="Correct answer (exact match)"
                              placeholder="Expected answer"
                              value={q.correctAnswer}
                              onChange={(e) => updateQuestion(q.tempId, { correctAnswer: e.target.value })}
                            />
                          )}
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => removeQuestion(q.tempId)} className="text-red-600 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={saving || !title.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save quiz
                </Button>
                <Button variant="outline" onClick={closeForm}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin Quiz Preview */}
      {previewQuiz && (
        <AdminQuizPreview quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />
      )}

      {/* CSV Import Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setImportOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-800">Import questions from CSV</h3>
              <button type="button" onClick={() => setImportOpen(false)} className="rounded-lg p-1.5 hover:bg-neutral-100 text-neutral-500">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-neutral-600 leading-relaxed">
              Upload a CSV with columns:{' '}
              <code className="bg-neutral-100 px-1 rounded text-xs">
                type, question, information, option_a, option_b, option_c, option_d, correct
              </code>.
              <br />
              For multiple_choice/flashcard: <code className="bg-neutral-100 px-1 rounded text-xs">correct</code> = A/B/C/D.
              For short_answer: write the expected answer text.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={downloadQuizTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Download template
              </Button>
              <Button variant="outline" size="sm" onClick={() => csvRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" />
                {importFileName || 'Choose CSV file'}
              </Button>
              <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCSVFile} />
            </div>

            {importErrors.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Parse warnings
                </div>
                {importErrors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-700 pl-6">{err}</p>
                ))}
              </div>
            )}

            {importParsed && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 space-y-1">
                <p className="font-semibold">{importParsed.length} question{importParsed.length !== 1 ? 's' : ''} parsed</p>
                <div className="text-xs space-y-0.5">
                  {importParsed.slice(0, 5).map((q, i) => (
                    <p key={i} className="pl-2 truncate">
                      <span className="font-medium capitalize">{q.type.replace('_', ' ')}</span>: {q.question || '(empty)'}
                    </p>
                  ))}
                  {importParsed.length > 5 && <p className="pl-2 text-green-700">…and {importParsed.length - 5} more</p>}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2 flex-wrap">
              <Button onClick={() => applyImport('replace')} disabled={!importParsed}>
                Replace all questions
              </Button>
              <Button variant="outline" onClick={() => applyImport('append')} disabled={!importParsed}>
                Append to existing
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminQuizzes;
