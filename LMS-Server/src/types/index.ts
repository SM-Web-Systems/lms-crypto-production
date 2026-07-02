import { Request } from 'express';

// User Types
export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
}

// Submission Types
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

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
  createdAt?: string;
  updatedAt?: string;
}

// JWT Types
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  studentId?: string;
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
  | { id: string; type: 'video'; title: string; order?: number; url: string; description?: string; information?: string }
  | { id: string; type: 'link'; title: string; order?: number; url: string; description?: string; information?: string }
  | {
      id: string;
      type: 'pdf';
      title: string;
      order?: number;
      documentId?: string;
      fileUrl?: string;
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

// Error Codes
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  SUBMISSION_LOCKED: 'SUBMISSION_LOCKED',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

