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

4. **Initialize a new, isolated database explicitly**

   Build first, set `DATABASE_PATH` to a new path in a writable directory, then:

   ```bash
   npm run build
   DATABASE_PATH=./data/new-lms.db npm run db:init -- --initialize-new
   DATABASE_PATH=./data/new-lms.db npm start
   ```

   PowerShell: set `$env:DATABASE_PATH = './data/new-lms.db'` before the commands.
   Initialization creates the canonical schema and default roles/templates, with no login accounts.
   Any existing file (including an empty file) or WAL/SHM/journal sidecar is refused.
   `db:schema` is a compatibility alias for the same compiled command and requires the same flag.
   Alternate schema files are unsupported. Provision an administrator separately using the reviewed
   administrator provisioning procedure; never seed demonstration credentials into a deployment.

   Normal startup refuses missing, corrupt, partial or unsupported databases. Preserve the database
   and all sidecars, then follow the [AUTH-13 bootstrap procedure](../docs/specs/AUTH-13-application-integrity-spec.md).
   Do not delete files or rerun initialization as a repair. Existing legacy rebuilds need a separately
   reviewed offline migration; the startup path performs additive changes transactionally.

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

## Test accounts

Automated tests create disposable synthetic accounts. Production initialization creates none.
Legacy development seed scripts are not a production provisioning procedure.

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
