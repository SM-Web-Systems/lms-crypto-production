# Course Documents API Specification

This document specifies the backend API endpoints required to support the new **Course Materials** feature in the Student Management System frontend.

---

## Overview

The Course Documents feature allows:
- **Admins** to upload, manage, and delete learning materials for students
- **Students** to browse and download course materials uploaded by admins

---

## Data Model

### CourseDocument

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
  updatedAt?: string;            // ISO 8601 timestamp (when updated)
}
```

### Database Schema (SQL)

```sql
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

-- Indexes for common queries
CREATE INDEX idx_documents_category ON course_documents(category);
CREATE INDEX idx_documents_uploaded_at ON course_documents(uploaded_at DESC);
CREATE INDEX idx_documents_uploaded_by ON course_documents(uploaded_by_id);
```

---

## API Endpoints

### Base URL
```
Development: http://localhost:3001/api/v1
Production: https://api.yourdomain.com/api/v1
```

All endpoints require authentication via JWT Bearer token:
```
Authorization: Bearer <jwt_token>
```

---

### 1. GET /documents

Get all course documents with optional filtering and pagination.

**Access:** All authenticated users (students and admins)

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

---

### 2. GET /documents/:id

Get a single document by ID.

**Access:** All authenticated users

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

---

### 3. POST /documents

Upload a new course document.

**Access:** Admin only

**Content-Type:** `multipart/form-data`

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
    "message": "File type not supported. Allowed types: PDF, DOC, DOCX, ZIP, TXT, PNG, JPG, GIF"
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

---

### 4. PUT /documents/:id

Update document metadata (title, description, category).

**Access:** Admin only

**Content-Type:** `application/json`

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

---

### 5. DELETE /documents/:id

Delete a document and its associated file.

**Access:** Admin only

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

---

### 6. GET /documents/:id/download

Download the document file.

**Access:** All authenticated users

**Response Headers:**
```
Content-Type: <file's MIME type>
Content-Disposition: attachment; filename="original_filename.pdf"
Content-Length: <file size in bytes>
```

**Response Body:** Binary file data

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

---

### 7. GET /documents/categories

Get list of all unique categories currently in use.

**Access:** All authenticated users

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

## Predefined Categories

The frontend includes these predefined categories. The backend can use these as defaults or allow custom categories:

1. Lecture Notes
2. Assignments
3. Study Guides
4. Reference Materials
5. Exam Preparation
6. Project Resources
7. Tutorials
8. Other

---

## File Storage

### Storage Structure
```
/uploads/
  /documents/
    /2026/
      /01/
        abc123-def456.pdf
        xyz789-uvw012.docx
```

### Storage Recommendations
- Generate unique filenames using UUID + original extension
- Store original filename in database for display
- Use cloud storage (AWS S3, Google Cloud Storage) for production
- Set appropriate read permissions for authenticated users only

---

## Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | User doesn't have permission (not admin) |
| `NOT_FOUND` | 404 | Document not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `FILE_TOO_LARGE` | 400 | File exceeds 10MB limit |
| `INVALID_FILE_TYPE` | 400 | Unsupported file type |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Implementation Checklist

- [ ] Create `course_documents` database table
- [ ] Implement `GET /documents` with filtering and pagination
- [ ] Implement `GET /documents/:id`
- [ ] Implement `POST /documents` with file upload (multipart/form-data)
- [ ] Implement `PUT /documents/:id` for metadata updates
- [ ] Implement `DELETE /documents/:id` (delete file and database record)
- [ ] Implement `GET /documents/:id/download` for file downloads
- [ ] Implement `GET /documents/categories` for category list
- [ ] Add admin-only middleware to POST, PUT, DELETE endpoints
- [ ] Configure file storage (local or cloud)
- [ ] Add file size validation (10MB max)
- [ ] Add file type validation
- [ ] Add input validation for title, description, category

---

## Frontend Integration

The frontend is already configured to call these endpoints. The service file is located at:
```
src/services/documentsService.ts
```

Frontend pages:
- **Student view:** `/student/documents` - Browse and download materials
- **Admin view:** `/admin/documents` - Upload, manage, and delete materials

---

**Document Version:** 1.0  
**Created:** January 7, 2026  
**Related to:** Frontend v1.0.0 Course Materials Feature

