# Student Management System - Backend Server

A TypeScript/Express backend server for the KanyaCSI Student Management System. This server provides a RESTful API for managing students, submissions, and user authentication.

## Features

- **JWT Authentication** - Secure token-based authentication
- **Role-based Access Control** - Admin and Student roles with different permissions
- **Student Management** - Full CRUD operations for student records (Admin only)
- **Submission System** - Students can submit assignments with file uploads
- **Review Workflow** - Admins can approve/reject submissions with feedback
- **Analytics Dashboard** - Overview of system statistics (Admin only)
- **File Upload** - Secure file handling with Multer (PDF, DOC, DOCX, ZIP, TXT)
- **SQLite Database** - Zero configuration, file-based database

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **File Upload**: Multer

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   cd lms-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** (optional)
   
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # Database Configuration (SQLite file path)
   DATABASE_PATH=./data/student_ms.db

   # JWT Configuration
   JWT_SECRET=your-super-secret-key-change-this-in-production-min-32-chars
   JWT_EXPIRES_IN=24h

   # Google Sign-In (optional; use same Client ID as frontend)
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

   # File Upload Configuration
   MAX_FILE_SIZE=10485760
   UPLOAD_DIR=./uploads

   # CORS Configuration
   FRONTEND_URL=http://localhost:5173

   # Clerk (optional — use with Clerk-powered frontend)
   # Secret key from Clerk Dashboard → API Keys (not the publishable key).
   # Enables verifying Clerk session JWTs on protected routes and /auth/me.
   CLERK_SECRET_KEY=sk_test_...
   # Optional: comma-separated allowed origins for Clerk tokens (defaults to FRONTEND_URL)
   # CLERK_AUTHORIZED_PARTIES=http://localhost:5173,https://yourapp.com
   ```

   **Clerk + LMS users:** On first successful Clerk sign-in, the server links by **email** to an existing `users` row (and sets `clerk_user_id`) or creates a **student** user plus a `students` row. Seed admins/students in the DB first if you need a specific role; new Clerk-only sign-ups are **students**.

4. **Initialize the database**

   **Option A – SM Web Systems LMS (schema + seed two users)**  
   If you use the schema from the `SM-Web-systems-LMS` repo and only need admin + student logins:

   ```bash
   # From server repo; DB path = DATABASE_PATH or ./data/student_ms.db
   npm run db:schema    # run schema once (uses database/schema.sql in this repo)
   npm run db:seed      # seed admin@smwebsystems.com and student@smwebsystems.com
   ```

   To use a different schema file: `SCHEMA_SQL_PATH=/path/to/schema.sql npm run db:schema`

   **Option B – Full init (Kanya sample data)**  
   ```bash
   npm run db:init
   ```
   This creates all tables and seeds sample data (admin@kanya.edu, john@kanya.edu, etc.).

## Running the Server

### Development
```bash
npm run dev
```
Server runs at `http://localhost:3001` with hot reload.

### Production
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/login` | Login and get JWT token | No |
| POST | `/api/v1/auth/logout` | Logout (invalidate token) | Yes |
| GET | `/api/v1/auth/me` | Get current user info | Yes |

### Students (Admin Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/students` | Get all students (paginated) |
| GET | `/api/v1/students/:id` | Get student by ID |
| POST | `/api/v1/students` | Create new student |
| PUT | `/api/v1/students/:id` | Update student |
| DELETE | `/api/v1/students/:id` | Delete student |

### Submissions
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/submissions` | Get submissions (filtered by role) | Yes |
| GET | `/api/v1/submissions/:id` | Get submission by ID | Yes |
| POST | `/api/v1/submissions` | Create submission (Students) | Student |
| PUT | `/api/v1/submissions/:id` | Update submission | Student |
| DELETE | `/api/v1/submissions/:id` | Delete submission | Yes |
| GET | `/api/v1/submissions/:id/download` | Download file | Yes |
| POST | `/api/v1/submissions/:id/review` | Review submission | Admin |

### Analytics (Admin Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/dashboard` | Get dashboard statistics |

## Test Credentials

**After `npm run db:schema` + `npm run db:seed` (SM Web Systems):**
- **Admin:** `admin@smwebsystems.com` / `admin123`
- **Student:** `student@smwebsystems.com` / `student123`

**After `npm run db:init` (Kanya sample data):**
- **Admin:** `admin@kanya.edu` / `admin123`
- **Students:** `john@kanya.edu`, `jane@kanya.edu`, etc. / `student123`

## Project Structure

```
src/
├── config/
│   ├── database.ts     # SQLite connection
│   └── jwt.ts          # JWT utilities
├── controllers/
│   ├── authController.ts
│   ├── studentsController.ts
│   ├── submissionsController.ts
│   └── analyticsController.ts
├── middleware/
│   ├── auth.ts         # Authentication & authorization
│   └── errorHandler.ts # Global error handling
├── routes/
│   ├── auth.ts
│   ├── students.ts
│   ├── submissions.ts
│   └── analytics.ts
├── scripts/
│   └── initDb.ts       # Database initialization
├── types/
│   └── index.ts        # TypeScript interfaces
├── utils/
│   └── fileUpload.ts   # Multer configuration
├── app.ts              # Express app setup
└── server.ts           # Server entry point
data/
└── student_ms.db       # SQLite database file
```

## File Upload

- **Supported formats**: PDF, DOC, DOCX, ZIP, TXT
- **Max file size**: 10MB (configurable via `MAX_FILE_SIZE`)
- **Storage**: Local filesystem (configurable via `UPLOAD_DIR`)
- Files are stored with UUID names and organized by year/month

## Error Handling

All errors follow a consistent format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": []
  }
}
```

## License

MIT
