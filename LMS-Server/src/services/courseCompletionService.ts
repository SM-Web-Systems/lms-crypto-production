/**
 * courseCompletionService.ts — Course progress and completion gate.
 *
 * Calculates whether a student meets a course's NFT eligibility requirements.
 * Used by the NFT application routes to gate the "apply" action.
 */

import { query, queryOne } from '../config/database.js';
import { CourseCompletionRequirements, CourseSection } from '../types/index.js';
import { parseFlatSections } from '../utils/courseHelpers.js';

/** Defaults applied when no course_completion_requirements row exists. */
const DEFAULT_REQS = {
  require_all_lessons: 0,
  lesson_threshold: 0,
  required_quiz_ids: '[]',
  min_quiz_score: 70,
  require_submissions: 0,
};

export interface QuizProgressItem {
  quizId: string;
  quizTitle: string;
  required: boolean;
  passed: boolean;
  score: number | null;
  passingScore: number;
}

export interface CourseProgress {
  userId: string;
  courseId: string;
  totalLessonItems: number;
  completedLessonItems: number;
  lessonPercentage: number;
  requiredQuizzes: QuizProgressItem[];
  allRequiredQuizzesPassed: boolean;
  hasApprovedSubmission: boolean;
  meetsAllRequirements: boolean;
  canApplyForCertificate: boolean;
}

/** Return the requirements row for a course, or null if none configured. */
export function getRequirements(courseId: string): CourseCompletionRequirements | null {
  return queryOne<CourseCompletionRequirements>(
    'SELECT * FROM course_completion_requirements WHERE course_id = ?',
    [courseId]
  );
}

/**
 * Calculate a student's completion progress for a course.
 * Returns meetsAllRequirements=false when the course does not exist.
 */
export function getCourseProgress(userId: string, courseId: string): CourseProgress {
  const course = queryOne<{ sections: string }>(
    'SELECT sections FROM courses WHERE id = ?',
    [courseId]
  );

  if (!course) {
    return {
      userId, courseId,
      totalLessonItems: 0, completedLessonItems: 0, lessonPercentage: 100,
      requiredQuizzes: [], allRequiredQuizzesPassed: true,
      hasApprovedSubmission: true, meetsAllRequirements: false,
      canApplyForCertificate: false,
    };
  }

  const reqs = (queryOne<CourseCompletionRequirements>(
    'SELECT * FROM course_completion_requirements WHERE course_id = ?',
    [courseId]
  ) ?? DEFAULT_REQS) as CourseCompletionRequirements;

  // 1. Count all lesson items from sections JSON
  const sections: CourseSection[] = parseFlatSections(course.sections || '[]');
  const allItems = sections.flatMap((s) => s.items);
  const totalLessonItems = allItems.length;

  // 2. Count completed lesson items for this user
  const completedRows = query<{ item_id: string }>(
    'SELECT item_id FROM lesson_completions WHERE user_id = ? AND course_id = ? AND completed_at IS NOT NULL',
    [userId, courseId]
  );
  const completedSet = new Set(completedRows.map((r) => r.item_id));
  const completedLessonItems = allItems.filter((i) => completedSet.has(i.id)).length;

  const lessonPercentage =
    totalLessonItems > 0
      ? Math.round((completedLessonItems / totalLessonItems) * 100)
      : 100;

  // Lesson gate: require all when flag is on AND there are items to complete
  const lessonOk =
    !reqs.require_all_lessons || completedLessonItems >= totalLessonItems;

  // 3. Check required quizzes
  const requiredIds: string[] = JSON.parse(reqs.required_quiz_ids || '[]');
  const requiredQuizzes: QuizProgressItem[] = [];

  for (const quizId of requiredIds) {
    const quiz = queryOne<{ title: string; passing_score: number }>(
      'SELECT title, passing_score FROM quizzes WHERE id = ?',
      [quizId]
    );
    const completion = queryOne<{ passed: number; score: number }>(
      'SELECT passed, score FROM quiz_completions WHERE quiz_id = ? AND user_id = ?',
      [quizId, userId]
    );
    const passedQuiz =
      completion?.passed === 1 &&
      (completion?.score ?? 0) >= reqs.min_quiz_score;

    requiredQuizzes.push({
      quizId,
      quizTitle: quiz?.title ?? 'Unknown',
      required: true,
      passed: passedQuiz,
      score: completion?.score ?? null,
      passingScore: reqs.min_quiz_score,
    });
  }

  const allRequiredQuizzesPassed = requiredQuizzes.every((q) => q.passed);

  // 4. Check submissions
  let hasApprovedSubmission = true; // default: not required → satisfied
  if (reqs.require_submissions) {
    const student = queryOne<{ id: string }>(
      'SELECT id FROM students WHERE user_id = ?',
      [userId]
    );
    if (student) {
      const approved = queryOne<{ id: string }>(
        "SELECT id FROM submissions WHERE student_id = ? AND status = 'approved'",
        [student.id]
      );
      hasApprovedSubmission = !!approved;
    } else {
      hasApprovedSubmission = false;
    }
  }

  const meetsAllRequirements = allRequiredQuizzesPassed && lessonOk && hasApprovedSubmission;

  // 5. Existing non-rejected application blocks re-apply
  const existingApp = queryOne<{ status: string }>(
    "SELECT status FROM course_nft_applications WHERE user_id = ? AND course_id = ? AND status NOT IN ('rejected')",
    [userId, courseId]
  );
  const canApplyForCertificate = meetsAllRequirements && !existingApp;

  return {
    userId, courseId,
    totalLessonItems, completedLessonItems, lessonPercentage,
    requiredQuizzes, allRequiredQuizzesPassed,
    hasApprovedSubmission, meetsAllRequirements, canApplyForCertificate,
  };
}
