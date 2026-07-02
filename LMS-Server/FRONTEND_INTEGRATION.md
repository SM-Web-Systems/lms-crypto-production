# Frontend Integration Guide

This document provides everything needed to connect your React/TypeScript frontend to the backend API.

---

## Quick Setup

### 1. Environment Variable

Create/update your frontend `.env` file:

```env
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

### 2. Install Axios (if not already installed)

```bash
npm install axios
```

---

## API Service Implementation

Create `src/services/api.ts`:

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - adds auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handles auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## Type Definitions

Create `src/types/api.ts`:

```typescript
// User Types
export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
  file: File;
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
```

---

## Auth Service

Create `src/services/authService.ts`:

```typescript
import api from './api';
import { ApiResponse, LoginResponse, User } from '../types/api';

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', {
      email,
      password,
    });
    
    if (response.data.success && response.data.data) {
      const { token, user } = response.data.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Login failed');
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },

  async getMe(): Promise<User> {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to get user');
  },

  getStoredUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken(): string | null {
    return localStorage.getItem('token');
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
```

---

## Students Service

Create `src/services/studentsService.ts`:

```typescript
import api from './api';
import {
  ApiResponse,
  Student,
  CreateStudentData,
  UpdateStudentData,
  StudentQueryParams,
  Pagination,
} from '../types/api';

interface StudentsResponse {
  students: Student[];
  pagination: Pagination;
}

export const studentsService = {
  async getAll(params?: StudentQueryParams): Promise<StudentsResponse> {
    const response = await api.get<ApiResponse<StudentsResponse>>('/students', {
      params,
    });
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to fetch students');
  },

  async getById(id: string): Promise<Student> {
    const response = await api.get<ApiResponse<Student>>(`/students/${id}`);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to fetch student');
  },

  async create(data: CreateStudentData): Promise<Student> {
    const response = await api.post<ApiResponse<Student>>('/students', data);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to create student');
  },

  async update(id: string, data: UpdateStudentData): Promise<Student> {
    const response = await api.put<ApiResponse<Student>>(`/students/${id}`, data);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to update student');
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(`/students/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete student');
    }
  },
};
```

---

## Submissions Service

Create `src/services/submissionsService.ts`:

```typescript
import api from './api';
import {
  ApiResponse,
  Submission,
  CreateSubmissionData,
  ReviewSubmissionData,
  SubmissionQueryParams,
  Pagination,
} from '../types/api';

interface SubmissionsResponse {
  submissions: Submission[];
  pagination: Pagination;
}

export const submissionsService = {
  async getAll(params?: SubmissionQueryParams): Promise<SubmissionsResponse> {
    const response = await api.get<ApiResponse<SubmissionsResponse>>('/submissions', {
      params,
    });
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to fetch submissions');
  },

  async getById(id: string): Promise<Submission> {
    const response = await api.get<ApiResponse<Submission>>(`/submissions/${id}`);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to fetch submission');
  },

  async create(data: CreateSubmissionData): Promise<Submission> {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('file', data.file);

    const response = await api.post<ApiResponse<Submission>>('/submissions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to create submission');
  },

  async update(id: string, data: { title?: string; description?: string }): Promise<Submission> {
    const response = await api.put<ApiResponse<Submission>>(`/submissions/${id}`, data);
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to update submission');
  },

  async delete(id: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(`/submissions/${id}`);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete submission');
    }
  },

  async review(id: string, data: ReviewSubmissionData): Promise<Submission> {
    const response = await api.post<ApiResponse<Submission>>(
      `/submissions/${id}/review`,
      data
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to review submission');
  },

  getDownloadUrl(id: string): string {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';
    return `${baseUrl}/submissions/${id}/download`;
  },

  async download(id: string): Promise<void> {
    const token = localStorage.getItem('token');
    const response = await fetch(this.getDownloadUrl(id), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = contentDisposition
      ?.split('filename=')[1]
      ?.replace(/"/g, '') || 'download';

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
```

---

## Analytics Service

Create `src/services/analyticsService.ts`:

```typescript
import api from './api';
import { ApiResponse, DashboardAnalytics } from '../types/api';

export const analyticsService = {
  async getDashboard(): Promise<DashboardAnalytics> {
    const response = await api.get<ApiResponse<DashboardAnalytics>>('/analytics/dashboard');
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    
    throw new Error(response.data.error?.message || 'Failed to fetch analytics');
  },
};
```

---

## Auth Context Example

Create `src/contexts/AuthContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '../services/authService';
import { User } from '../types/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const storedUser = authService.getStoredUser();
    if (storedUser && authService.isAuthenticated()) {
      setUser(storedUser);
      // Optionally verify token is still valid
      authService.getMe()
        .then(setUser)
        .catch(() => {
          authService.logout();
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { user } = await authService.login(email, password);
    setUser(user);
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

---

## Usage Examples

### Login Form

```typescript
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(email, password);
      // Redirect handled by router or context
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
}
```

### Fetching Students

```typescript
import { useState, useEffect } from 'react';
import { studentsService } from '../services/studentsService';
import { Student, Pagination } from '../types/api';

function StudentsList() {
  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadStudents();
  }, [page]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const data = await studentsService.getAll({ page, limit: 20 });
      setStudents(data.students);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <ul>
        {students.map((student) => (
          <li key={student.id}>
            {student.name} - {student.email} - {student.department}
          </li>
        ))}
      </ul>
      {pagination && (
        <div>
          <button 
            disabled={page === 1} 
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span>Page {page} of {pagination.totalPages}</span>
          <button 
            disabled={page === pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

### Submission Form with File Upload

```typescript
import { useState, useRef } from 'react';
import { submissionsService } from '../services/submissionsService';

function SubmissionForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await submissionsService.create({ title, description, file });
      // Reset form
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert('Submission created successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        maxLength={200}
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        maxLength={1000}
        required
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.zip,.txt"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        required
      />
      <p>Max file size: 10MB. Allowed: PDF, DOC, DOCX, ZIP, TXT</p>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```

---

## Error Handling

The API returns errors in this format:

```typescript
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    details: [
      { field: "email", message: "Email already exists" }
    ]
  }
}
```

### Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `FILE_TOO_LARGE` | 400 | File exceeds 10MB limit |
| `INVALID_FILE_TYPE` | 400 | Unsupported file type |
| `SUBMISSION_LOCKED` | 403 | Cannot modify reviewed submission |
| `DUPLICATE_ENTRY` | 409 | Email or enrollment number exists |

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@kanya.edu` | `admin123` |
| Student | `john@kanya.edu` | `student123` |
| Student | `jane@kanya.edu` | `student123` |

---

## Data Context Example

If your frontend uses a DataContext for students/submissions, update it to fetch from the API:

Create `src/contexts/DataContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { studentsService } from '../services/studentsService';
import { submissionsService } from '../services/submissionsService';
import { Student, Submission, Pagination } from '../types/api';

interface DataContextType {
  // Students
  students: Student[];
  studentsPagination: Pagination | null;
  studentsLoading: boolean;
  fetchStudents: (params?: { page?: number; search?: string; department?: string }) => Promise<void>;
  createStudent: (data: any) => Promise<Student>;
  updateStudent: (id: string, data: any) => Promise<Student>;
  deleteStudent: (id: string) => Promise<void>;
  
  // Submissions
  submissions: Submission[];
  submissionsPagination: Pagination | null;
  submissionsLoading: boolean;
  fetchSubmissions: (params?: { page?: number; status?: string }) => Promise<void>;
  createSubmission: (data: { title: string; description: string; file: File }) => Promise<Submission>;
  reviewSubmission: (id: string, status: 'approved' | 'rejected', feedback?: string) => Promise<Submission>;
  deleteSubmission: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  // Students state
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsPagination, setStudentsPagination] = useState<Pagination | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsPagination, setSubmissionsPagination] = useState<Pagination | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Student operations
  const fetchStudents = useCallback(async (params?: { page?: number; search?: string; department?: string }) => {
    setStudentsLoading(true);
    try {
      const data = await studentsService.getAll(params);
      setStudents(data.students);
      setStudentsPagination(data.pagination);
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const createStudent = useCallback(async (data: any) => {
    const student = await studentsService.create(data);
    setStudents(prev => [student, ...prev]);
    return student;
  }, []);

  const updateStudent = useCallback(async (id: string, data: any) => {
    const student = await studentsService.update(id, data);
    setStudents(prev => prev.map(s => s.id === id ? student : s));
    return student;
  }, []);

  const deleteStudent = useCallback(async (id: string) => {
    await studentsService.delete(id);
    setStudents(prev => prev.filter(s => s.id !== id));
  }, []);

  // Submission operations
  const fetchSubmissions = useCallback(async (params?: { page?: number; status?: string }) => {
    setSubmissionsLoading(true);
    try {
      const data = await submissionsService.getAll(params);
      setSubmissions(data.submissions);
      setSubmissionsPagination(data.pagination);
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  const createSubmission = useCallback(async (data: { title: string; description: string; file: File }) => {
    const submission = await submissionsService.create(data);
    setSubmissions(prev => [submission, ...prev]);
    return submission;
  }, []);

  const reviewSubmission = useCallback(async (id: string, status: 'approved' | 'rejected', feedback?: string) => {
    const submission = await submissionsService.review(id, { status, feedback });
    setSubmissions(prev => prev.map(s => s.id === id ? submission : s));
    return submission;
  }, []);

  const deleteSubmission = useCallback(async (id: string) => {
    await submissionsService.delete(id);
    setSubmissions(prev => prev.filter(s => s.id !== id));
  }, []);

  return (
    <DataContext.Provider
      value={{
        students,
        studentsPagination,
        studentsLoading,
        fetchStudents,
        createStudent,
        updateStudent,
        deleteStudent,
        submissions,
        submissionsPagination,
        submissionsLoading,
        fetchSubmissions,
        createSubmission,
        reviewSubmission,
        deleteSubmission,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
```

---

## Migration Checklist

Follow these steps to migrate from localStorage to the API:

### Step 1: Create API Service File
Copy `src/services/api.ts` from this guide - it sets up Axios with auth token interceptors.

### Step 2: Replace localStorage Calls with API Calls

**Before (localStorage):**
```typescript
// Saving
localStorage.setItem('students', JSON.stringify(students));

// Loading
const students = JSON.parse(localStorage.getItem('students') || '[]');
```

**After (API):**
```typescript
// Saving
await studentsService.create(studentData);

// Loading
const { students } = await studentsService.getAll();
```

### Step 3: Update AuthContext for JWT

**Before (localStorage user only):**
```typescript
const [user, setUser] = useState(() => {
  return JSON.parse(localStorage.getItem('user') || 'null');
});
```

**After (JWT token + API validation):**
```typescript
const [user, setUser] = useState<User | null>(null);

const login = async (email: string, password: string) => {
  const { token, user } = await authService.login(email, password);
  // Token stored automatically by authService
  setUser(user);
};
```

### Step 4: Update DataContext to Fetch from API

Replace any direct localStorage reads with service calls (see DataContext example above).

### Step 5: Add Loading States and Error Handling

**Before:**
```typescript
const students = JSON.parse(localStorage.getItem('students') || '[]');
return <StudentList students={students} />;
```

**After:**
```typescript
const [students, setStudents] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

useEffect(() => {
  studentsService.getAll()
    .then(data => setStudents(data.students))
    .catch(err => setError(err.message))
    .finally(() => setLoading(false));
}, []);

if (loading) return <Spinner />;
if (error) return <Error message={error} />;
return <StudentList students={students} />;
```

### Step 6: Configure API Base URL

Add to your frontend `.env`:
```env
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

For production:
```env
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

---

## File Structure Summary

```
src/
├── services/
│   ├── api.ts              # Axios instance with interceptors
│   ├── authService.ts      # Login, logout, getMe
│   ├── studentsService.ts  # Student CRUD
│   ├── submissionsService.ts # Submissions + file upload
│   └── analyticsService.ts # Dashboard stats
├── types/
│   └── api.ts              # TypeScript interfaces
└── contexts/
    ├── AuthContext.tsx     # Auth state management
    └── DataContext.tsx     # Students & submissions state
```

