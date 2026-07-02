export type UserRole = "student" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  walletAddress: string;
  role: UserRole;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  enrollmentNumber: string;
  department: string;
  semester: number;
  createdAt: string;
}

export interface Submission {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  feedback?: string;
}

export interface SubmissionFormData {
  title: string;
  description: string;
  file: File | null;
}

export interface CourseDocument {
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

export interface DocumentFormData {
  title: string;
  description: string;
  category: string;
  file: File | null;
}
