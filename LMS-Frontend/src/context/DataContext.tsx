import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { studentsService } from '../services/studentsService';
import { submissionsService } from '../services/submissionsService';
import { getErrorMessage } from '../utils/apiError';
import { 
  Student, 
  Submission, 
  Pagination, 
  CreateStudentData, 
  UpdateStudentData,
  CreateSubmissionData,
  StudentQueryParams,
  SubmissionQueryParams 
} from '../types/api';

interface DataContextType {
  // Students
  students: Student[];
  studentsPagination: Pagination | null;
  studentsLoading: boolean;
  studentsError: string | null;
  fetchStudents: (params?: StudentQueryParams) => Promise<void>;
  addStudent: (data: CreateStudentData) => Promise<Student>;
  updateStudent: (id: string, data: UpdateStudentData) => Promise<Student>;
  deleteStudent: (id: string) => Promise<void>;
  
  // Submissions
  submissions: Submission[];
  submissionsPagination: Pagination | null;
  submissionsLoading: boolean;
  submissionsError: string | null;
  fetchSubmissions: (params?: SubmissionQueryParams) => Promise<void>;
  addSubmission: (data: CreateSubmissionData) => Promise<Submission>;
  updateSubmission: (id: string, data: { title?: string; description?: string }) => Promise<Submission>;
  deleteSubmission: (id: string) => Promise<void>;
  reviewSubmission: (id: string, status: 'approved' | 'rejected', feedback: string, reviewerName: string) => Promise<Submission>;
  downloadSubmission: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Students state
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsPagination, setStudentsPagination] = useState<Pagination | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsPagination, setSubmissionsPagination] = useState<Pagination | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);

  // Student operations
  const fetchStudents = useCallback(async (params?: StudentQueryParams) => {
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const data = await studentsService.getAll(params);
      setStudents(data.students);
      setStudentsPagination(data.pagination);
    } catch (error) {
      const message = getErrorMessage(error, 'Could not load students.');
      setStudentsError(message);
      console.error('Error fetching students:', error);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const addStudent = useCallback(async (data: CreateStudentData): Promise<Student> => {
    const student = await studentsService.create(data);
    setStudents(prev => [student, ...prev]);
    return student;
  }, []);

  const updateStudent = useCallback(async (id: string, data: UpdateStudentData): Promise<Student> => {
    const student = await studentsService.update(id, data);
    setStudents(prev => prev.map(s => s.id === id ? student : s));
    return student;
  }, []);

  const deleteStudent = useCallback(async (id: string): Promise<void> => {
    await studentsService.delete(id);
    setStudents(prev => prev.filter(s => s.id !== id));
    // Also remove submissions from this student
    setSubmissions(prev => prev.filter(sub => sub.studentId !== id));
  }, []);

  // Submission operations
  const fetchSubmissions = useCallback(async (params?: SubmissionQueryParams) => {
    setSubmissionsLoading(true);
    setSubmissionsError(null);
    try {
      const data = await submissionsService.getAll(params);
      setSubmissions(data.submissions);
      setSubmissionsPagination(data.pagination);
    } catch (error) {
      const message = getErrorMessage(error, 'Could not load submissions.');
      setSubmissionsError(message);
      console.error('Error fetching submissions:', error);
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  const addSubmission = useCallback(async (data: CreateSubmissionData): Promise<Submission> => {
    const submission = await submissionsService.create(data);
    setSubmissions(prev => [submission, ...prev]);
    return submission;
  }, []);

  const updateSubmission = useCallback(async (
    id: string, 
    data: { title?: string; description?: string }
  ): Promise<Submission> => {
    const submission = await submissionsService.update(id, data);
    setSubmissions(prev => prev.map(s => s.id === id ? submission : s));
    return submission;
  }, []);

  const deleteSubmission = useCallback(async (id: string): Promise<void> => {
    await submissionsService.delete(id);
    setSubmissions(prev => prev.filter(s => s.id !== id));
  }, []);

  const reviewSubmission = useCallback(async (
    id: string, 
    status: 'approved' | 'rejected', 
    feedback: string,
    _reviewerName: string // Not needed as backend handles this
  ): Promise<Submission> => {
    const submission = await submissionsService.review(id, { status, feedback });
    setSubmissions(prev => prev.map(s => s.id === id ? submission : s));
    return submission;
  }, []);

  const downloadSubmission = useCallback(async (id: string): Promise<void> => {
    await submissionsService.download(id);
  }, []);

  return (
    <DataContext.Provider
      value={{
        // Students
        students,
        studentsPagination,
        studentsLoading,
        studentsError,
        fetchStudents,
        addStudent,
        updateStudent,
        deleteStudent,
        // Submissions
        submissions,
        submissionsPagination,
        submissionsLoading,
        submissionsError,
        fetchSubmissions,
        addSubmission,
        updateSubmission,
        deleteSubmission,
        reviewSubmission,
        downloadSubmission,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
