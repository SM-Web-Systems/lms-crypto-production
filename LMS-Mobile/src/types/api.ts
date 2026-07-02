// User Types
export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Course codes the user can access (students). When backend supports this, include in auth/me. */
  courseCodes?: string[];
}

export interface LoginResponse {
  token: string;
  user: User;
}

/**
 * React Native file shape for multipart uploads (replaces the web `File`).
 * Produced by expo-document-picker / expo-image-picker results.
 */
export interface NativeFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

// Student Types
export interface Student {
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

export interface CreateStudentData {
  name: string;
  email: string;
  enrollmentNumber: string;
  department: string;
  semester: number;
}

export interface UpdateStudentData {
  name?: string;
  email?: string;
  enrollmentNumber?: string;
  department?: string;
  semester?: number;
}

// Submission Types
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface Submission {
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
}

export interface CreateSubmissionData {
  title: string;
  description: string;
  file: NativeFile;
}

export interface ReviewSubmissionData {
  status: 'approved' | 'rejected';
  feedback?: string;
}

// Pagination Types
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
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

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

// Query Parameters
export interface StudentQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  semester?: number;
}

export interface SubmissionQueryParams {
  page?: number;
  limit?: number;
  status?: SubmissionStatus;
  studentId?: string;
}

// Course Document Types
export interface CourseDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  fileMimeType?: string;
  /** When set, only students enrolled in these courses (by course id) can access; omitted/empty = all students. */
  courseIds?: string[];
  uploadedBy: string;
  uploadedById: string;
  uploadedAt: string;
  updatedAt?: string;
}

export interface CreateDocumentData {
  title: string;
  description: string;
  category: string;
  file: NativeFile;
  courseIds?: string[];
}

export interface UpdateDocumentData {
  title?: string;
  description?: string;
  category?: string;
  courseIds?: string[];
}

export interface DocumentQueryParams {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
}
