# Backend API Specification for Student Management System

This document provides a complete specification for building a backend server that integrates with the Student Management System frontend. The frontend is built with React/TypeScript and expects a RESTful JSON API.

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Recommendations](#technology-recommendations)
3. [Data Models](#data-models)
4. [Authentication](#authentication)
5. [API Endpoints](#api-endpoints)
   - [Students API](#students-api-admin-only)
   - [Submissions API](#submissions-api)
   - [Course Documents API](#course-documents-api) ⭐ NEW
   - [Analytics API](#analytics-api-admin-only)
6. [File Upload](#file-upload)
7. [Error Handling](#error-handling)
8. [CORS Configuration](#cors-configuration)

---

## Overview

### Application Purpose
A student management system for KanyaCSI that allows:
- **Students** to submit written work/assignments for review
- **Students** to download course materials/learning documents uploaded by admins
- **Administrators** to manage students and review/approve/reject submissions
- **Administrators** to upload and manage course documents for students

### User Roles
| Role | Permissions |
|------|-------------|
| `student` | View own profile, create/view/delete own submissions, download course documents |
| `admin` | Full CRUD on students, review all submissions, view analytics, upload/manage course documents |

### Base URL
```
Production: https://api.yourdomain.com/api/v1
Development: http://localhost:3001/api/v1
```

---

## Technology Recommendations

The backend can be built with any technology. Recommended stacks:
- **Node.js**: Express.js or Fastify with TypeScript
- **Python**: FastAPI or Django REST Framework
- **Go**: Gin or Echo
- **Database**: PostgreSQL or MongoDB
- **File Storage**: AWS S3, Google Cloud Storage, or local filesystem

---

## Data Models

### User
```typescript
interface User {
  id: string;                    // UUID or database ID
  name: string;                  // Full name
  email: string;                 // Unique, used for login
  password: string;              // Hashed, never returned in responses
  role: 'student' | 'admin';     // User role
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### Student
```typescript
interface Student {
  id: string;                    // UUID or database ID
  userId?: string;               // Optional link to User account
  name: string;                  // Full name
  email: string;                 // Contact email
  enrollmentNumber: string;      // Unique enrollment/registration number
  department: string;            // Department name
  semester: number;              // Current semester (1-8)
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### Submission
```typescript
interface Submission {
  id: string;                    // UUID or database ID
  studentId: string;             // Reference to Student
  studentName: string;           // Denormalized for display
  title: string;                 // Assignment title
  description: string;           // Assignment description
  fileName: string;              // Original filename
  fileSize: number;              // File size in bytes
  fileUrl: string;               // URL to download the file
  fileMimeType?: string;         // MIME type of uploaded file
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;           // ISO 8601 timestamp
  reviewedAt?: string;           // ISO 8601 timestamp (when reviewed)
  reviewedBy?: string;           // Name of admin who reviewed
  reviewedById?: string;         // ID of admin who reviewed
  feedback?: string;             // Admin feedback/comments
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### CourseDocument ⭐ NEW
```typescript
interface CourseDocument {
  id: string;                    // UUID or database ID
  title: string;                 // Document title (max 200 chars)
  description: string;           // Document description (max 1000 chars)
  category: string;              // Category for grouping (e.g., "Lecture Notes")
  fileName: string;              // Original filename
  fileSize: number;              // File size in bytes
  fileUrl: string;               // URL/path to download the file
  fileMimeType?: string;         // MIME type of the file
  uploadedBy: string;            // Name of admin who uploaded
  uploadedById: string;          // ID of admin who uploaded
  uploadedAt: string;            // ISO 8601 timestamp
  createdAt: string;             // ISO 8601 timestamp
  updatedAt?: string;            // ISO 8601 timestamp
}
```

---

## Authentication

### Method
JWT (JSON Web Token) Bearer authentication

### Token Structure
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: 'student' | 'admin';
  iat: number;      // Issued at
  exp: number;      // Expiration (recommended: 24 hours)
}
```

### Authentication Header
All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Auth Endpoints

#### POST /auth/login
Authenticate user and return JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "1",
      "name": "John Doe",
      "email": "user@example.com",
      "role": "student"
    }
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

#### POST /auth/logout
Invalidate the current token (optional, for token blacklisting).

**Headers:** `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET /auth/me
Get current authenticated user info.

**Headers:** `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "student"
  }
}
```

---

## API Endpoints

### Students API (Admin Only)

#### GET /students
Get all students with optional filtering and pagination.

**Headers:** `Authorization: Bearer <admin_token>`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `search` | string | Search by name, email, or enrollment number |
| `department` | string | Filter by department |
| `semester` | number | Filter by semester |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "students": [
      {
        "id": "1",
        "name": "John Doe",
        "email": "john@kanya.edu",
        "enrollmentNumber": "KCS2024001",
        "department": "Computer Science",
        "semester": 4,
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

#### GET /students/:id
Get a single student by ID.

**Headers:** `Authorization: Bearer <admin_token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "name": "John Doe",
    "email": "john@kanya.edu",
    "enrollmentNumber": "KCS2024001",
    "department": "Computer Science",
    "semester": 4,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### POST /students
Create a new student.

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@kanya.edu",
  "enrollmentNumber": "KCS2024002",
  "department": "Information Technology",
  "semester": 2
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "2",
    "name": "Jane Smith",
    "email": "jane@kanya.edu",
    "enrollmentNumber": "KCS2024002",
    "department": "Information Technology",
    "semester": 2,
    "createdAt": "2024-01-20T14:00:00Z"
  }
}
```

**Validation Errors (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "Email already exists" },
      { "field": "enrollmentNumber", "message": "Enrollment number already exists" }
    ]
  }
}
```

#### PUT /students/:id
Update an existing student.

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body (partial update allowed):**
```json
{
  "name": "Jane Smith Updated",
  "semester": 3
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "2",
    "name": "Jane Smith Updated",
    "email": "jane@kanya.edu",
    "enrollmentNumber": "KCS2024002",
    "department": "Information Technology",
    "semester": 3,
    "createdAt": "2024-01-20T14:00:00Z",
    "updatedAt": "2024-01-25T09:00:00Z"
  }
}
```

#### DELETE /students/:id
Delete a student and all their submissions.

**Headers:** `Authorization: Bearer <admin_token>`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Student and associated submissions deleted successfully"
}
```

---

### Submissions API

#### GET /submissions
Get submissions (filtered by role).

**Headers:** `Authorization: Bearer <token>`

**Behavior:**
- **Students**: Returns only their own submissions
- **Admins**: Returns all submissions

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `status` | string | Filter: 'pending', 'approved', 'rejected' |
| `studentId` | string | Filter by student (admin only) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "id": "1",
        "studentId": "1",
        "studentName": "John Doe",
        "title": "Data Structures Assignment",
        "description": "Implementation of Binary Search Tree",
        "fileName": "bst_implementation.pdf",
        "fileSize": 245600,
        "fileUrl": "/api/v1/submissions/1/download",
        "status": "pending",
        "submittedAt": "2024-01-18T16:30:00Z",
        "reviewedAt": null,
        "reviewedBy": null,
        "feedback": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "totalPages": 1
    }
  }
}
```

#### GET /submissions/:id
Get a single submission.

**Headers:** `Authorization: Bearer <token>`

**Access Control:**
- Students can only view their own submissions
- Admins can view any submission

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "studentId": "1",
    "studentName": "John Doe",
    "title": "Data Structures Assignment",
    "description": "Implementation of Binary Search Tree with insert, delete, and search operations",
    "fileName": "bst_implementation.pdf",
    "fileSize": 245600,
    "fileUrl": "/api/v1/submissions/1/download",
    "status": "pending",
    "submittedAt": "2024-01-18T16:30:00Z",
    "reviewedAt": null,
    "reviewedBy": null,
    "feedback": null
  }
}
```

#### POST /submissions
Create a new submission (multipart/form-data for file upload).

**Headers:** 
- `Authorization: Bearer <student_token>`
- `Content-Type: multipart/form-data`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Assignment title (max 200 chars) |
| `description` | string | Yes | Description (max 1000 chars) |
| `file` | File | Yes | The file to upload |

**Accepted File Types:**
- PDF (application/pdf)
- DOC (application/msword)
- DOCX (application/vnd.openxmlformats-officedocument.wordprocessingml.document)
- ZIP (application/zip)
- TXT (text/plain)

**Max File Size:** 10 MB

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "3",
    "studentId": "1",
    "studentName": "John Doe",
    "title": "Web Development Project",
    "description": "React application for e-commerce",
    "fileName": "ecommerce_project.zip",
    "fileSize": 1024000,
    "fileUrl": "/api/v1/submissions/3/download",
    "status": "pending",
    "submittedAt": "2024-01-20T10:00:00Z"
  }
}
```

**Error Response (400) - File too large:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds maximum limit of 10MB"
  }
}
```

#### PUT /submissions/:id
Update a submission (only allowed if status is 'pending').

**Headers:** `Authorization: Bearer <student_token>`

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "3",
    "title": "Updated Title",
    "description": "Updated description",
    "status": "pending",
    "updatedAt": "2024-01-20T11:00:00Z"
  }
}
```

**Error Response (403) - Already reviewed:**
```json
{
  "success": false,
  "error": {
    "code": "SUBMISSION_LOCKED",
    "message": "Cannot update a submission that has already been reviewed"
  }
}
```

#### DELETE /submissions/:id
Delete a submission.

**Headers:** `Authorization: Bearer <token>`

**Access Control:**
- Students can delete their own pending submissions
- Admins can delete any submission

**Success Response (200):**
```json
{
  "success": true,
  "message": "Submission deleted successfully"
}
```

#### GET /submissions/:id/download
Download the submission file.

**Headers:** `Authorization: Bearer <token>`

**Access Control:**
- Students can download their own files
- Admins can download any file

**Response:**
- Content-Type: (file's MIME type)
- Content-Disposition: attachment; filename="original_filename.pdf"
- Body: Binary file data

#### POST /submissions/:id/review (Admin Only)
Review a submission (approve or reject).

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "status": "approved",
  "feedback": "Excellent work! Clean code and good documentation."
}
```

OR

```json
{
  "status": "rejected",
  "feedback": "Please revise the implementation. The sorting algorithm has bugs."
}
```

**Validation:**
- `status` must be 'approved' or 'rejected'
- `feedback` is required when rejecting

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "1",
    "status": "approved",
    "feedback": "Excellent work! Clean code and good documentation.",
    "reviewedAt": "2024-01-21T09:30:00Z",
    "reviewedBy": "Admin User",
    "reviewedById": "admin-1"
  }
}
```

---

### Course Documents API ⭐ NEW

This API allows admins to upload learning materials and students to download them.

#### GET /documents
Get all course documents with optional filtering and pagination.

**Access:** All authenticated users (students and admins)

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `category` | string | Filter by category |
| `search` | string | Search in title and description |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-uuid-1",
        "title": "Introduction to Data Structures",
        "description": "Comprehensive guide covering arrays, linked lists, trees, and graphs",
        "category": "Lecture Notes",
        "fileName": "data_structures_intro.pdf",
        "fileSize": 2456000,
        "fileUrl": "/api/v1/documents/doc-uuid-1/download",
        "fileMimeType": "application/pdf",
        "uploadedBy": "Admin User",
        "uploadedById": "admin-uuid-1",
        "uploadedAt": "2026-01-05T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

#### GET /documents/:id
Get a single document by ID.

**Access:** All authenticated users

**Headers:** `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid-1",
    "title": "Introduction to Data Structures",
    "description": "Comprehensive guide covering arrays, linked lists, trees, and graphs",
    "category": "Lecture Notes",
    "fileName": "data_structures_intro.pdf",
    "fileSize": 2456000,
    "fileUrl": "/api/v1/documents/doc-uuid-1/download",
    "fileMimeType": "application/pdf",
    "uploadedBy": "Admin User",
    "uploadedById": "admin-uuid-1",
    "uploadedAt": "2026-01-05T10:30:00Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Document not found"
  }
}
```

#### POST /documents (Admin Only)
Upload a new course document.

**Headers:** 
- `Authorization: Bearer <admin_token>`
- `Content-Type: multipart/form-data`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Document title (max 200 chars) |
| `description` | string | Yes | Description (max 1000 chars) |
| `category` | string | Yes | Category name |
| `file` | File | Yes | The file to upload |

**Accepted File Types:**
- PDF (`application/pdf`)
- DOC (`application/msword`)
- DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- ZIP (`application/zip`)
- TXT (`text/plain`)
- PNG (`image/png`)
- JPG/JPEG (`image/jpeg`)
- GIF (`image/gif`)

**Max File Size:** 10 MB

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid-2",
    "title": "Week 1 Assignment",
    "description": "Complete the exercises on pages 10-15",
    "category": "Assignments",
    "fileName": "week1_assignment.pdf",
    "fileSize": 512000,
    "fileUrl": "/api/v1/documents/doc-uuid-2/download",
    "fileMimeType": "application/pdf",
    "uploadedBy": "Admin User",
    "uploadedById": "admin-uuid-1",
    "uploadedAt": "2026-01-07T14:00:00Z"
  }
}
```

**Error Response (400) - File too large:**
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds maximum limit of 10MB"
  }
}
```

**Error Response (400) - Invalid file type:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "File type not supported"
  }
}
```

**Error Response (403) - Not admin:**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Only administrators can upload documents"
  }
}
```

#### PUT /documents/:id (Admin Only)
Update document metadata (title, description, category).

**Headers:** `Authorization: Bearer <admin_token>`

**Request Body (partial update allowed):**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "category": "Study Guides"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "doc-uuid-1",
    "title": "Updated Title",
    "description": "Updated description",
    "category": "Study Guides",
    "fileName": "data_structures_intro.pdf",
    "fileSize": 2456000,
    "fileUrl": "/api/v1/documents/doc-uuid-1/download",
    "fileMimeType": "application/pdf",
    "uploadedBy": "Admin User",
    "uploadedById": "admin-uuid-1",
    "uploadedAt": "2026-01-05T10:30:00Z",
    "updatedAt": "2026-01-07T15:00:00Z"
  }
}
```

#### DELETE /documents/:id (Admin Only)
Delete a document and its associated file.

**Headers:** `Authorization: Bearer <admin_token>`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Document not found"
  }
}
```

#### GET /documents/:id/download
Download the document file.

**Access:** All authenticated users

**Headers:** `Authorization: Bearer <token>`

**Response Headers:**
```
Content-Type: <file's MIME type>
Content-Disposition: attachment; filename="original_filename.pdf"
Content-Length: <file size in bytes>
```

**Response Body:** Binary file data

#### GET /documents/categories
Get list of all unique categories currently in use.

**Access:** All authenticated users

**Headers:** `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "categories": [
      "Lecture Notes",
      "Assignments",
      "Study Guides",
      "Reference Materials",
      "Exam Preparation",
      "Project Resources",
      "Tutorials",
      "Other"
    ]
  }
}
```

---

### Analytics API (Admin Only)

#### GET /analytics/dashboard
Get dashboard statistics.

**Headers:** `Authorization: Bearer <admin_token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "totalStudents": 45,
    "totalSubmissions": 120,
    "submissionsByStatus": {
      "pending": 15,
      "approved": 90,
      "rejected": 15
    },
    "studentsByDepartment": [
      { "department": "Computer Science", "count": 20 },
      { "department": "Information Technology", "count": 15 },
      { "department": "Electronics", "count": 10 }
    ],
    "recentSubmissions": [
      {
        "id": "120",
        "studentName": "John Doe",
        "title": "Latest Assignment",
        "status": "pending",
        "submittedAt": "2024-01-20T10:00:00Z"
      }
    ]
  }
}
```

---

## File Upload

### Storage Requirements
- Store files in a persistent storage system (cloud storage recommended)
- Generate unique filenames to prevent conflicts (e.g., UUID + original extension)
- Store original filename in database for display

### File Serving
- Serve files through authenticated endpoints only
- Set appropriate Content-Type and Content-Disposition headers
- Consider signed URLs for cloud storage

### Example File Storage Structure
```
/uploads/
  /submissions/
    /2024/
      /01/
        abc123-def456.pdf
        xyz789-uvw012.docx
  /documents/
    /2026/
      /01/
        doc123-abc456.pdf
        doc789-xyz012.docx
```

---

## Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": []  // Optional, for validation errors
  }
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `FILE_TOO_LARGE` | 400 | File exceeds size limit |
| `INVALID_FILE_TYPE` | 400 | Unsupported file type |
| `SUBMISSION_LOCKED` | 403 | Cannot modify reviewed submission |
| `DUPLICATE_ENTRY` | 409 | Email or enrollment number exists |
| `INTERNAL_ERROR` | 500 | Server error |

---

## CORS Configuration

The backend must allow requests from the frontend origin.

### Development Configuration
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

### Production Configuration
```
Access-Control-Allow-Origin: https://your-frontend-domain.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

---

## Database Schema (SQL Example)

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Students table
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  enrollment_number VARCHAR(50) UNIQUE NOT NULL,
  department VARCHAR(255) NOT NULL,
  semester INTEGER NOT NULL CHECK (semester >= 1 AND semester <= 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Submissions table
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_mime_type VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_id UUID REFERENCES users(id),
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Course Documents table (NEW)
CREATE TABLE course_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_mime_type VARCHAR(100),
  uploaded_by_id UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_students_department ON students(department);
CREATE INDEX idx_students_semester ON students(semester);
CREATE INDEX idx_submissions_student_id ON submissions(student_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_documents_category ON course_documents(category);
CREATE INDEX idx_documents_uploaded_at ON course_documents(uploaded_at DESC);
CREATE INDEX idx_documents_uploaded_by ON course_documents(uploaded_by_id);
```

---

## Environment Variables

The backend should support these environment variables:

```bash
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/student_ms

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=24h

# File Upload
MAX_FILE_SIZE=10485760  # 10MB in bytes
UPLOAD_DIR=./uploads
# Or for cloud storage:
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# CORS
FRONTEND_URL=http://localhost:5173
```

---

## Implementation Checklist

- [ ] Set up project with chosen framework
- [ ] Configure database connection
- [ ] Implement User model and authentication
- [ ] Create JWT middleware for protected routes
- [ ] Implement Student CRUD endpoints
- [ ] Implement Submission CRUD endpoints
- [ ] Set up file upload handling
- [ ] Implement review functionality
- [ ] Add analytics endpoint
- [ ] **Implement Course Documents API (NEW)**
  - [ ] Create `course_documents` database table
  - [ ] Implement `GET /documents` with filtering and pagination
  - [ ] Implement `GET /documents/:id`
  - [ ] Implement `POST /documents` with file upload (admin only)
  - [ ] Implement `PUT /documents/:id` for metadata updates (admin only)
  - [ ] Implement `DELETE /documents/:id` (admin only)
  - [ ] Implement `GET /documents/:id/download`
  - [ ] Implement `GET /documents/categories`
- [ ] Configure CORS
- [ ] Add input validation
- [ ] Implement error handling
- [ ] Add rate limiting (recommended)
- [ ] Write API tests
- [ ] Set up logging

---

## Frontend Integration Notes

Once the backend is ready, update the frontend:

1. Create an API service file (`src/services/api.ts`)
2. Replace localStorage calls with API calls
3. Update AuthContext to use JWT token storage
4. Update DataContext to fetch from API
5. Add loading states and error handling
6. Configure API base URL via environment variable

---

**Document Version:** 1.1  
**Last Updated:** January 7, 2026  
**Frontend Version:** 1.1.0

---

## Changelog

### v1.1 (January 7, 2026)
- Added **Course Documents API** - Allows admins to upload learning materials for students to download
- Added `CourseDocument` data model
- Added `course_documents` database table schema
- Updated user roles with new permissions
- Added 7 new endpoints for document management

