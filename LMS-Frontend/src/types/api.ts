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
export type UserRole = "student" | "admin" | "lecturer" | "sponsor" | "employer" | "parent" | "teacher" | "teaching-assistant" | "custom";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  walletAddress: string | null;
  walletLinkingStatus: 'none' | 'linked' | 'existing_account';
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
  walletAddress?: string | null;
  walletLinkingStatus?: 'none' | 'linked' | 'existing_account';
}

export interface WalletStatusResponse {
  walletAddress: string | null;
  walletLinkingStatus: 'none' | 'linked' | 'existing_account';
  network: 'mainnet' | null;
  xlmBalance: number | null;
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
  courseId?: string;
  weekId?: string;
  itemId?: string;
}

export interface CreateSubmissionData {
  title: string;
  description: string;
  file: File;
  courseId?: string;
  weekId?: string;
  itemId?: string;
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

// Course completion / NFT application types
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

export type CertificateStatus = 'not_eligible' | 'eligible' | 'pending' | 'approved' | 'minted' | 'rejected';

export interface MyCourseProgress extends CourseProgress {
  courseName: string;
  courseCode: string | null;
  certificateStatus: CertificateStatus;
  applicationId: string | null;
  txHash: string | null;
}

export type NftApplicationStatus = 'pending' | 'approved' | 'rejected' | 'minted';

export interface NftApplication {
  applicationId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  courseId: string;
  courseName?: string;
  walletAddress: string;
  status: NftApplicationStatus;
  appliedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  lecturerRecommendation: string | null;
  txHash: string | null;
  /** Populated when a failed nft_credentials row exists for this application. Admin-level detail. */
  mintError?: string | null;
  /** Phase 11 C1a: payment status for this application (null = free course) */
  paymentStatus?: 'pending' | 'confirmed' | 'waived' | null;
  paymentId?: string | null;
  priceCents?: number;
  /** Phase 11 C2: selected tier for this application */
  selectedTier?: CertificateTier;
}

export type CredentialMintStatus = 'pending' | 'minted' | 'failed';

/** Full credential record from nft_credentials — covers both legacy quiz-triggered and
 *  course-level application-workflow mints. mintPath indicates which flow created it. */
export interface IssuedCredential {
  credentialId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  courseId: string | null;
  courseName: string | null;
  quizId: string | null;
  quizTitle: string | null;
  applicationId: string | null;
  walletAddress: string;
  mintStatus: CredentialMintStatus;
  txHash: string | null;
  contractId: string | null;
  network: string | null;
  mintedAt: string | null;
  mintError: string | null;
  /** Null for legacy quiz-triggered mints that bypassed the application workflow. */
  applicationStatus: NftApplicationStatus | null;
  appliedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  mintPath: 'course_application' | 'quiz_trigger';
  /** L-013: true when this credential has been superseded by a re-mint correction. */
  isSuperseded: boolean;
}

/** Credential record returned by GET /credentials/mine (student's own minted certs). */
export interface MyCredential {
  credentialId: string;
  walletAddress: string;
  txHash: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseCode: string | null;
  quizId: string | null;
  quizTitle: string | null;
  network: string | null;
  issuedAt: string;
  sorobanTokenId: number | null;
  contractId: string;
}

// ─── Phase 11 C1a: Payment types ─────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'confirmed' | 'waived' | 'failed' | 'refunded';

export interface CoursePricing {
  courseId: string;
  priceCents: number;
  currency: string;
  isFree: boolean;
  stellarPriceXlm?: number | null;
  stellarPriceUsdc?: number | null;
  paymentMethods?: string[];
}

export interface PaymentRecord {
  paymentId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  courseId: string;
  courseName: string | null;
  applicationId: string | null;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  status: PaymentStatus;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  notes: string | null;
  createdAt: string;
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

// Phase 11 C2: Freemium certificate tiers
export type CertificateTier = 'free' | 'paid';
export type TiersEnabled = 'free_only' | 'paid_only' | 'both';

export interface TierInfo {
  tiersEnabled: TiersEnabled;
  priceCents: number;
  currency: string;
  isFree: boolean;
}

export interface CertificateBadgeData {
  badgeId: string;
  userId: string;
  courseId: string;
  applicationId: string;
  badgeSvg: string;
  badgeHash: string;
  createdAt: string;
}

// ─── Phase 11 C3: Sponsor Cohort types ───────────────────────────────────────

export interface SponsorCohortSummary {
  cohortId: string;
  name: string;
  courseId: string;
  courseName: string;
  selectedTier: CertificateTier;
  status: 'draft' | 'active' | 'completed';
  memberCount: number;
  appliedCount: number;
  paymentStatus: string | null;
  createdAt: string;
}

export interface CohortMemberDetail {
  userId: string;
  userName: string;
  userEmail: string;
  applicationId: string | null;
  applicationStatus: string | null;
  isEnrolled: boolean;
  addedAt: string;
  lessonProgress: number;
  meetsRequirements: boolean;
  certificateStatus: 'none' | 'badge' | 'nft';
}

export interface CohortCompletionStats {
  totalMembers: number;
  completedCount: number;
  certifiedCount: number;
  avgLessonProgress: number;
}

export interface BulkApplyResult {
  cohortId: string;
  applied: number;
  skipped: { userId: string; reason: string }[];
}
