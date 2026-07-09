export interface NFTResponse {
  indexed: {
    tokens: [
      {
        token: {
          id: number;
          collectionId: number;
          tokenId: number;
          owner: string;
          metadataUri: string;
          name: string;
          description: string;
          image: string;
          attributes: [
            {
              value: string;
              trait_type: string;
            },
            {
              value: string;
              trait_type: string;
            }
          ],
          isBurned: boolean;
          lastSyncedAt: null;
          createdAt: string;
          updatedAt: string;
        },
        collection: {
          id: number;
          type: string;
          contractId: string;
          assetCode: null;
          assetIssuer: null;
          name: string;
          symbol: string;
          baseUri: string;
          description: string;
          image: null;
          creator: null;
          totalSupply: number;
          isVerified: boolean;
          network: string;
          createdAt: string;
          updatedAt: string;
        }
      }
    ];
  }
}

// User Types
export type UserRole = "student" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  walletAddress: string;
  /** Course codes the user can access (students). When backend supports this, include in auth/me. */
  courseCodes?: string[];
}

export interface LoginResponse {
  token: string;
  user: User;
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
export type SubmissionStatus = "pending" | "approved" | "rejected";

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
  file: File;
}

export interface ReviewSubmissionData {
  status: "approved" | "rejected";
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
  file: File;
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

export interface NftToken {
  id: number;
  collectionId: number;
  tokenId: number;
  owner: string;
  metadataUri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  attributes: { trait_type: string; value: string }[] | null;
  isBurned: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
