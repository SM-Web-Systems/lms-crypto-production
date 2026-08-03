import { Request } from "express";

// User Types
export type UserRole = "student" | "lecturer" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;  // null / sentinel '$sso$' for AmmaWallet SSO users
  role: UserRole;
  walletAddress: string | null;
  wallet_linking_status: 'none' | 'linked' | 'existing_account';
  /** 'local' = password-authenticated; 'ammawallet' = SSO via AmmaWallet */
  auth_provider: 'local' | 'ammawallet';
  /** AmmaWallet numeric user ID (as string) — null for local-only accounts */
  ammawallet_user_id: string | null;
  password_reset_token: string | null;
  password_reset_expires_at: string | null;
  password_changed_at: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  walletAddress: string;
  courseCodes?: string[];
}

// Student Types
export interface Student {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  enrollment_number: string;
  department: string;
  semester: number;
  created_at: Date;
  updated_at: Date;
}

export interface StudentResponse {
  id: string;
  userId?: string;
  name: string;
  email: string;
  enrollmentNumber: string;
  department: string;
  semester: number;
  createdAt: string;
  updatedAt?: string;
  walletAddress?: string | null;
  walletLinkingStatus?: 'none' | 'linked' | 'existing_account';
}

// Submission Types
export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface Submission {
  id: string;
  student_id: string;
  title: string;
  description: string;
  file_name: string;
  file_size: number;
  file_path: string;
  file_mime_type?: string;
  status: SubmissionStatus;
  submitted_at: Date;
  reviewed_at?: Date;
  reviewed_by_id?: string;
  feedback?: string;
  // Phase 1 Course-Centric IA: optional course/week/item context
  course_id?: string;
  week_id?: string;
  item_id?: string;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  student_name?: string;
  reviewer_name?: string;
}

export interface SubmissionResponse {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  fileMimeType?: string;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedById?: string;
  feedback?: string;
  // Phase 1 Course-Centric IA: optional course/week/item context
  courseId?: string;
  weekId?: string;
  itemId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// JWT Types
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  studentId?: string;
  // Standard JWT claim set automatically by jsonwebtoken
  iat?: number;
}

// Extended Request Type
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}

// Course Document Types
export interface CourseDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  file_name: string;
  file_size: number;
  file_path: string;
  file_mime_type?: string;
  course_ids?: string | null; // JSON array of course IDs; empty/null = open to all
  uploaded_by_id: string;
  uploaded_at: Date;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  uploader_name?: string;
}

export interface CourseDocumentResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  fileMimeType?: string;
  courseIds?: string[];
  uploadedBy: string;
  uploadedById: string;
  uploadedAt: string;
  updatedAt?: string;
}

// Forum Types (BACKEND_UPDATE_REQUIREMENTS)
export interface ForumAuthor {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ForumTopicResponse {
  id: string;
  title: string;
  body: string;
  /** null / undefined = General channel */
  courseId?: string | null;
  author: ForumAuthor;
  createdAt: string;
  updatedAt?: string;
  postCount: number;
  lastPostAt?: string | null;
}

export interface ForumPostResponse {
  id: string;
  topicId: string;
  body: string;
  author: ForumAuthor;
  createdAt: string;
  updatedAt?: string;
}

// Course API Types (BACKEND_UPDATE_REQUIREMENTS)
export type CourseItem =
  | {
      id: string;
      type: "video";
      title: string;
      order?: number;
      url: string;
      description?: string;
      information?: string;
    }
  | {
      id: string;
      type: "link";
      title: string;
      order?: number;
      url: string;
      description?: string;
      information?: string;
    }
  | {
      id: string;
      type: "pdf";
      title: string;
      order?: number;
      documentId?: string;
      fileUrl?: string;
      description?: string;
      information?: string;
    }
  | {
      id: string;
      type: "audio";
      title: string;
      order?: number;
      url: string;
      description?: string;
      information?: string;
    }
  | {
      id: string;
      type: "quiz";
      title: string;
      order?: number;
      quizId: string;
      description?: string;
      information?: string;
    }
  | {
      id: string;
      type: "assignment";
      title: string;
      order?: number;
      description?: string;
      information?: string;
      maxFileSize?: number;
      allowedMimeTypes?: string[];
    }
  | {
      id: string;
      type: "download";
      title: string;
      order?: number;
      documentId?: string;
      fileUrl?: string;
      fileName: string;
      description?: string;
      information?: string;
    };

export interface CourseSection {
  id: string;
  title: string;
  objective?: string;
  outcome?: string;
  items: CourseItem[];
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  courseCode: string;
  sections: CourseSection[];
  sponsorLabel?: string;
}

// Messages API Types (BACKEND_UPDATE_REQUIREMENTS)
export interface ConversationResponse {
  id: string;
  participantIds: [string, string];
  participantNames: [string, string];
  updatedAt: string;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

// Course members & user directory (BACKEND_UPDATE_REQUIREMENTS)
export interface UserDirectoryItem {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  courseCodes?: string[];
}

// Analytics Types
export interface DashboardAnalytics {
  totalStudents: number;
  totalSubmissions: number;
  submissionsByStatus: {
    pending: number;
    approved: number;
    rejected: number;
  };
  studentsByDepartment: Array<{ department: string; count: number }>;
  recentSubmissions: Array<{
    id: string;
    studentName: string;
    title: string;
    status: SubmissionStatus;
    submittedAt: string;
  }>;
}

// Phase A — course completion and NFT application types

export interface CourseLecturer {
  course_id:   string;
  user_id:     string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface LessonCompletion {
  id:           string;
  user_id:      string;
  course_id:    string;
  item_id:      string;
  section_id:   string;
  completed_at: string;
  marked_by:    string | null;
}

export interface CourseCompletionRequirements {
  id:                  string;
  course_id:           string;
  require_all_lessons: number;   // 0/1 boolean
  lesson_threshold:    number;   // 0 = off; >0 = min items needed
  required_quiz_ids:   string;   // JSON array string
  min_quiz_score:      number;
  require_submissions: number;   // 0/1 boolean
  created_at:          string;
  updated_at:          string;
}

export type NftApplicationStatus = 'pending' | 'approved' | 'rejected' | 'minted';
export type LecturerRecommendation = 'approved' | 'not_ready';

export interface CourseNftApplication {
  id:                 string;
  user_id:            string;
  course_id:          string;
  wallet_address:     string;
  status:             NftApplicationStatus;
  applied_at:         string;
  reviewed_at:        string | null;
  reviewed_by:        string | null;
  review_notes:       string | null;
  lecturer_rec:       LecturerRecommendation | null;
  lecturer_rec_notes: string | null;
  lecturer_rec_by:    string | null;
  lecturer_rec_at:    string | null;
  tx_hash:            string | null;
  credential_id:      string | null;
}

// Error Codes
export const ErrorCodes = {
  UNAUTHORIZED:        "UNAUTHORIZED",
  FORBIDDEN:           "FORBIDDEN",
  NOT_FOUND:           "NOT_FOUND",
  VALIDATION_ERROR:    "VALIDATION_ERROR",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  FILE_TOO_LARGE:      "FILE_TOO_LARGE",
  INVALID_FILE_TYPE:   "INVALID_FILE_TYPE",
  SUBMISSION_LOCKED:   "SUBMISSION_LOCKED",
  DUPLICATE_ENTRY:     "DUPLICATE_ENTRY",
  INTERNAL_ERROR:      "INTERNAL_ERROR",
  SSO_REQUIRED:        "SSO_REQUIRED",
  REQUIREMENTS_NOT_MET: "REQUIREMENTS_NOT_MET",
  WALLET_NOT_LINKED:   "WALLET_NOT_LINKED",
  APPLICATION_EXISTS:  "APPLICATION_EXISTS",
} as const;
