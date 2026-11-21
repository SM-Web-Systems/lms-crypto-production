# Phase 23 C2: API Documentation (OpenAPI/Swagger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive API documentation (Swagger UI) at `/api-docs` backed by OpenAPI 3.0 annotations across all 28 route files.

**Architecture:** `swagger-jsdoc` parses `@openapi` JSDoc blocks from route files at startup, producing an OpenAPI 3.0.3 spec. `swagger-ui-express` serves interactive docs at `/api-docs`. Admin-only access in production via existing RBAC.

**Tech Stack:** swagger-jsdoc ^6.2.8, swagger-ui-express ^5.0.1, Express 4, TypeScript, vitest, supertest

## Global Constraints

- Express 4 (NOT Express 5) — no async handler support
- ESM project (`"type": "module"`) — all imports use `.js` extension
- better-sqlite3 is synchronous — route handlers that only call DB are sync
- Test command: `cd LMS-Server && npx vitest run` (NEVER `npx --prefix`)
- All paths relative to `/home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server/`
- Existing test count: 609 BE, 125 FE, 14 E2E
- Do NOT modify any existing route logic, controller code, or database schema

---

### Task 1: Install Dependencies + Create Swagger Config + Mount Routes + Write Tests

This is a single task because the test file, config, and app.ts mount are tightly coupled — you can't test spec generation without the config, and you can't test `/api-docs` without the mount.

**Files:**
- Modify: `package.json` (add 4 deps)
- Create: `src/config/swagger.ts`
- Modify: `src/app.ts` (add swagger imports + mount)
- Create: `src/__tests__/openapi.test.ts`

**Interfaces:**
- Produces: `swaggerSpec` (OpenAPI spec object) from `src/config/swagger.ts`
- Produces: `/api-docs` route (Swagger UI) and `/api-docs/spec.json` (raw spec)

- [ ] **Step 1: Install dependencies**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npm install swagger-jsdoc@^6.2.8 swagger-ui-express@^5.0.1
npm install -D @types/swagger-jsdoc@^6.0.4 @types/swagger-ui-express@^4.1.7
```

- [ ] **Step 2: Create `src/config/swagger.ts`**

```typescript
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'LMS API',
    version: '1.0.0',
    description: 'Blockchain Academy Learning Management System API',
  },
  servers: [
    { url: '/api/v1', description: 'API v1' },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Auth', description: 'Authentication and SSO' },
    { name: 'Users', description: 'User management' },
    { name: 'Profile', description: 'User profile management' },
    { name: 'Courses', description: 'Course CRUD and enrollment' },
    { name: 'Students', description: 'Student management (admin)' },
    { name: 'Lessons', description: 'Lesson completion tracking' },
    { name: 'Progress', description: 'Course progress' },
    { name: 'Quizzes', description: 'Quiz management and submissions' },
    { name: 'Submissions', description: 'Assignment submissions' },
    { name: 'Certificates', description: 'NFT certificate applications and credentials' },
    { name: 'Payments', description: 'Payment processing and billing' },
    { name: 'Cohorts', description: 'Sponsor cohort management' },
    { name: 'Analytics', description: 'Dashboard and reporting' },
    { name: 'Documents', description: 'Document management' },
    { name: 'Announcements', description: 'Course announcements' },
    { name: 'Forum', description: 'Discussion forum' },
    { name: 'Messages', description: 'Direct messaging' },
    { name: 'Notifications', description: 'User notifications' },
    { name: 'Invites', description: 'Course invitations' },
    { name: 'Wallet', description: 'Wallet status and balance' },
    { name: 'Admin', description: 'Admin diagnostics' },
    { name: 'RBAC', description: 'Role-based access control' },
    { name: 'Tenants', description: 'Multi-tenant management' },
    { name: 'Email Templates', description: 'Email template management' },
    { name: 'Webhooks', description: 'Payment webhooks' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from /auth/login',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Validation failed' },
            },
          },
        },
      },
    },
  },
};

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  apis: [
    path.resolve(__dirname, '../routes/*.ts'),
    path.resolve(__dirname, '../app.ts'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
```

- [ ] **Step 3: Mount Swagger UI in `src/app.ts`**

Add these imports after the existing imports (before `dotenv.config()`):

```typescript
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
```

Add these lines AFTER the `emailTemplateRoutes` mount (line 213) and BEFORE the uploads static serving (line 216):

```typescript
// ─── API Documentation ─────────────────────────────────────────────────────
app.get('/api-docs/spec.json', (_req, res) => { res.json(swaggerSpec); });
if (process.env.NODE_ENV === 'production') {
  app.use('/api-docs', authenticate, requirePermission('system.view_audit_log'), swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
```

Also add the `requirePermission` import — modify the existing import from `'./middleware/rbac.js'` if it doesn't exist, or add it. Currently `app.ts` does NOT import from rbac.ts, so add:

```typescript
import { requirePermission } from './middleware/rbac.js';
```

- [ ] **Step 4: Write test file `src/__tests__/openapi.test.ts`**

```typescript
/**
 * DOCS-1 — GET /api-docs/spec.json returns 200 + valid JSON
 * DOCS-2 — Spec has required OpenAPI fields
 * DOCS-3 — Spec contains all expected tags
 * DOCS-4 — GET /api-docs/ returns 200 + HTML with swagger
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('DOCS-1 — OpenAPI spec endpoint', () => {
  it('should return 200 with valid JSON spec', async () => {
    const res = await request(app).get('/api-docs/spec.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBeDefined();
    expect(typeof res.body).toBe('object');
  });
});

describe('DOCS-2 — OpenAPI spec structure', () => {
  it('should have required OpenAPI 3.0 fields', async () => {
    const res = await request(app).get('/api-docs/spec.json');
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info).toBeDefined();
    expect(res.body.info.title).toBe('LMS API');
    expect(res.body.info.version).toBeDefined();
    expect(res.body.paths).toBeDefined();
    expect(typeof res.body.paths).toBe('object');
  });
});

describe('DOCS-3 — OpenAPI spec tags', () => {
  it('should contain all 26 expected tags', async () => {
    const res = await request(app).get('/api-docs/spec.json');
    const tagNames = res.body.tags.map((t: { name: string }) => t.name);
    const expected = [
      'Health', 'Auth', 'Users', 'Profile', 'Courses', 'Students',
      'Lessons', 'Progress', 'Quizzes', 'Submissions', 'Certificates',
      'Payments', 'Cohorts', 'Analytics', 'Documents', 'Announcements',
      'Forum', 'Messages', 'Notifications', 'Invites', 'Wallet',
      'Admin', 'RBAC', 'Tenants', 'Email Templates', 'Webhooks',
    ];
    for (const tag of expected) {
      expect(tagNames).toContain(tag);
    }
  });
});

describe('DOCS-4 — Swagger UI serves HTML', () => {
  it('should return 200 with HTML containing swagger', async () => {
    const res = await request(app).get('/api-docs/').redirects(3);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text.toLowerCase()).toContain('swagger');
  });
});
```

- [ ] **Step 5: Run tests to verify baseline + new tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

Expected: 613 tests pass (609 existing + 4 new). DOCS-3 may initially show fewer paths since no `@openapi` annotations exist yet — that's OK. The tag test checks the base spec tags array, which is defined in swagger.ts.

- [ ] **Step 6: Run TypeScript check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
git add package.json package-lock.json src/config/swagger.ts src/app.ts src/__tests__/openapi.test.ts
git commit -m "feat(phase23-c2): add OpenAPI config, Swagger UI mount, and 4 docs tests"
```

---

### Task 2: Add @openapi Annotations — Auth, Users, Profile, Students

**Files:**
- Modify: `src/routes/auth.ts`
- Modify: `src/routes/users.ts`
- Modify: `src/routes/profile.ts`
- Modify: `src/routes/students.ts`
- Modify: `src/routes/studentProgress.ts`

**Interfaces:**
- Consumes: swagger-jsdoc scans these files for `@openapi` blocks
- Produces: OpenAPI paths for Auth (8 endpoints), Users (5), Profile (4), Students (7)

- [ ] **Step 1: Add @openapi annotations to `src/routes/auth.ts`**

Add before each route handler. The paths must be relative to the server mount (swagger server is `/api/v1`):

```typescript
/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: Account created }
 *       409: { description: Email already registered }
 */
router.post('/register', register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful, returns JWT token }
 *       401: { description: Invalid credentials }
 */
router.post('/login', login);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Reset email sent (always returns 200 for security) }
 */
router.post('/forgot-password', forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using a reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password reset successful }
 *       400: { description: Invalid or expired token }
 */
router.post('/reset-password', resetPassword);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Logged out }
 *       401: { description: Unauthorized }
 */
router.post('/logout', authenticate, logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user info
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Current user data }
 *       401: { description: Unauthorized }
 */
router.get('/me', authenticate, getMe);

/**
 * @openapi
 * /auth/amma-login:
 *   get:
 *     tags: [Auth]
 *     summary: Redirect to AmmaWallet SSO login
 *     responses:
 *       302: { description: Redirects to AmmaWallet SSO }
 */
router.get('/amma-login', ammaLogin);

/**
 * @openapi
 * /auth/amma-callback:
 *   get:
 *     tags: [Auth]
 *     summary: Receive AmmaWallet SSO assertion
 *     parameters:
 *       - in: query
 *         name: token
 *         schema: { type: string }
 *         description: SSO assertion token
 *     responses:
 *       200: { description: SSO login successful, returns JWT }
 *       401: { description: Invalid SSO token }
 */
router.get('/amma-callback', ammaCallback);
```

- [ ] **Step 2: Add @openapi annotations to `src/routes/users.ts`**

```typescript
/**
 * @openapi
 * /users/me/courses:
 *   get:
 *     tags: [Users]
 *     summary: Get own enrolled courses
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of enrolled courses }
 */
router.get('/me/courses', getMyCourses);

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: List of users }
 *       403: { description: Requires user.view_all permission }
 */
router.get('/', requirePermission('user.view_all'), getUsers);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get single user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User data }
 *       404: { description: User not found }
 */
router.get('/:id', getUser);

/**
 * @openapi
 * /users/{id}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Update user role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [student, lecturer, admin] }
 *     responses:
 *       200: { description: Role updated }
 *       403: { description: Requires user.manage permission }
 */
router.patch('/:id/role', requirePermission('user.manage'), patchUserRole);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update user fields
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *     responses:
 *       200: { description: User updated }
 *       403: { description: Requires user.manage permission }
 */
router.patch('/:id', requirePermission('user.manage'), patchUser);
```

- [ ] **Step 3: Add @openapi annotations to `src/routes/profile.ts`**

```typescript
/**
 * @openapi
 * /profile:
 *   get:
 *     tags: [Profile]
 *     summary: Get own profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Profile data }
 */
router.get('/', getProfile);

/**
 * @openapi
 * /profile:
 *   patch:
 *     tags: [Profile]
 *     summary: Update own profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               bio: { type: string }
 *     responses:
 *       200: { description: Profile updated }
 */
router.patch('/', patchProfile);

/**
 * @openapi
 * /profile/avatar:
 *   post:
 *     tags: [Profile]
 *     summary: Upload profile avatar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: Avatar uploaded }
 */
router.post('/avatar', avatarUploadMiddleware, uploadAvatar);

/**
 * @openapi
 * /profile/{userId}:
 *   get:
 *     tags: [Profile]
 *     summary: View another user's profile
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User profile data }
 *       404: { description: User not found }
 */
router.get('/:userId', getProfileById);
```

- [ ] **Step 4: Add @openapi annotations to `src/routes/students.ts`**

```typescript
/**
 * @openapi
 * /students:
 *   get:
 *     tags: [Students]
 *     summary: List all students (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated student list }
 *       403: { description: Requires user.view_all permission }
 */
router.get('/', getStudents);

/**
 * @openapi
 * /students/{id}:
 *   get:
 *     tags: [Students]
 *     summary: Get single student
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Student data }
 *       404: { description: Student not found }
 */
router.get('/:id', getStudent);

/**
 * @openapi
 * /students:
 *   post:
 *     tags: [Students]
 *     summary: Create new student
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       201: { description: Student created }
 */
router.post('/', createStudent);

/**
 * @openapi
 * /students/import:
 *   post:
 *     tags: [Students]
 *     summary: Bulk CSV import
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [students]
 *             properties:
 *               students:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     email: { type: string }
 *     responses:
 *       200: { description: Import results }
 */
router.post('/import', importStudents);

/**
 * @openapi
 * /students/{id}:
 *   put:
 *     tags: [Students]
 *     summary: Update student
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Student updated }
 */
router.put('/:id', updateStudent);

/**
 * @openapi
 * /students/{id}:
 *   delete:
 *     tags: [Students]
 *     summary: Delete student
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Student deleted }
 */
router.delete('/:id', deleteStudent);
```

- [ ] **Step 5: Add @openapi annotation to `src/routes/studentProgress.ts`**

```typescript
/**
 * @openapi
 * /students/me/progress:
 *   get:
 *     tags: [Students]
 *     summary: Get own progress across all enrolled courses
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Progress per course with cert status }
 */
router.get('/students/me/progress', authenticate, ...);
```

- [ ] **Step 6: Verify tests still pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/auth.ts src/routes/users.ts src/routes/profile.ts src/routes/students.ts src/routes/studentProgress.ts
git commit -m "docs(phase23-c2): add @openapi annotations — auth, users, profile, students"
```

---

### Task 3: Add @openapi Annotations — Courses, Lessons, Progress, Quizzes, Submissions

**Files:**
- Modify: `src/routes/courses.ts`
- Modify: `src/routes/courseRequirements.ts`
- Modify: `src/routes/lessonCompletions.ts`
- Modify: `src/routes/progress.ts`
- Modify: `src/routes/quizzes.ts`
- Modify: `src/routes/submissions.ts`

**Interfaces:**
- Produces: OpenAPI paths for Courses (12), CourseRequirements (2), Lessons (4), Progress (3), Quizzes (9), Submissions (7)

- [ ] **Step 1: Add @openapi to `src/routes/courses.ts`**

Add `@openapi` blocks above each handler. Paths relative to swagger server `/api/v1`:

For `courses.ts` mounted at `/api/v1/courses`:
- `GET /courses` → path: `/courses`
- `GET /courses/:id` → path: `/courses/{id}`
- `POST /courses` → path: `/courses`
- `PUT /courses/:id` → path: `/courses/{id}`
- `DELETE /courses/:id` → path: `/courses/{id}`
- `GET /courses/:id/members` → path: `/courses/{id}/members`
- `POST /courses/:id/members` → path: `/courses/{id}/members`
- `DELETE /courses/:id/members/:userId` → path: `/courses/{id}/members/{userId}`
- `GET /courses/:courseId/submissions` → path: `/courses/{courseId}/submissions`
- `GET /courses/:id/lecturers` → path: `/courses/{id}/lecturers`
- `POST /courses/:id/lecturers` → path: `/courses/{id}/lecturers`
- `DELETE /courses/:id/lecturers/:lecturerUserId` → path: `/courses/{id}/lecturers/{lecturerUserId}`

Each gets tags: [Courses], security: bearerAuth, appropriate parameters and response codes.

- [ ] **Step 2: Add @openapi to `src/routes/courseRequirements.ts`**

Mounted at `/api/v1/courses` — paths:
- `GET /courses/{courseId}/requirements` — tags: [Courses], security: bearerAuth
- `PUT /courses/{courseId}/requirements` — tags: [Courses], security: bearerAuth, requestBody with requireAllLessons, requiredQuizIds, minQuizScore, requireSubmissions

- [ ] **Step 3: Add @openapi to `src/routes/lessonCompletions.ts`**

Mounted at `/api/v1` — paths:
- `POST /courses/{courseId}/lessons/{itemId}/complete` — tags: [Lessons], security: bearerAuth
- `POST /courses/{courseId}/students/{userId}/lessons/{itemId}/complete` — tags: [Lessons], security: bearerAuth
- `PUT /courses/{courseId}/lessons/{itemId}/progress` — tags: [Lessons], security: bearerAuth, requestBody: positionSeconds, progressPercent
- `GET /courses/{courseId}/lessons/completions` — tags: [Lessons], security: bearerAuth

- [ ] **Step 4: Add @openapi to `src/routes/progress.ts`**

Mounted at `/api/v1` — paths:
- `GET /courses/{courseId}/progress` — tags: [Progress], security: bearerAuth
- `GET /courses/{courseId}/progress/all` — tags: [Progress], security: bearerAuth
- `GET /courses/{courseId}/students/{userId}/progress` — tags: [Progress], security: bearerAuth

- [ ] **Step 5: Add @openapi to `src/routes/quizzes.ts`**

Mounted at `/api/v1/quizzes` — paths:
- `GET /quizzes/completions` — tags: [Quizzes]
- `GET /quizzes/answer-keys` — tags: [Quizzes]
- `GET /quizzes/{id}/completion` — tags: [Quizzes]
- `POST /quizzes/{id}/submit` — tags: [Quizzes], requestBody: answers array
- `GET /quizzes` — tags: [Quizzes]
- `POST /quizzes` — tags: [Quizzes], requestBody: title, questions
- `GET /quizzes/{id}` — tags: [Quizzes]
- `PUT /quizzes/{id}` — tags: [Quizzes]
- `DELETE /quizzes/{id}` — tags: [Quizzes]

All with security: bearerAuth.

- [ ] **Step 6: Add @openapi to `src/routes/submissions.ts`**

Mounted at `/api/v1/submissions` — paths:
- `GET /submissions` — tags: [Submissions]
- `GET /submissions/{id}` — tags: [Submissions]
- `POST /submissions` — tags: [Submissions], requestBody: multipart/form-data with file
- `PUT /submissions/{id}` — tags: [Submissions]
- `DELETE /submissions/{id}` — tags: [Submissions]
- `GET /submissions/{id}/download` — tags: [Submissions]
- `POST /submissions/{id}/review` — tags: [Submissions], requestBody: status, feedback

All with security: bearerAuth.

- [ ] **Step 7: Run tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/routes/courses.ts src/routes/courseRequirements.ts src/routes/lessonCompletions.ts src/routes/progress.ts src/routes/quizzes.ts src/routes/submissions.ts
git commit -m "docs(phase23-c2): add @openapi annotations — courses, lessons, progress, quizzes, submissions"
```

---

### Task 4: Add @openapi Annotations — Certificates, Payments, Cohorts, Analytics

**Files:**
- Modify: `src/routes/nftApplications.ts`
- Modify: `src/routes/publicCredentials.ts`
- Modify: `src/routes/payments.ts`
- Modify: `src/routes/cohorts.ts`
- Modify: `src/routes/analytics.ts`

**Interfaces:**
- Produces: OpenAPI paths for Certificates (9), Payments (14), Cohorts (12), Analytics (6)

- [ ] **Step 1: Add @openapi to `src/routes/nftApplications.ts`**

Mounted at `/api/v1` — paths:
- `POST /courses/{courseId}/completions/apply` — tags: [Certificates]
- `GET /courses/{courseId}/completions/applications` — tags: [Certificates], query: status
- `GET /courses/{courseId}/completions/applications/{appId}` — tags: [Certificates]
- `POST /courses/{courseId}/completions/applications/{appId}/recommend` — tags: [Certificates], requestBody: recommendation, notes
- `PATCH /courses/{courseId}/completions/applications/{appId}/approve` — tags: [Certificates]
- `PATCH /courses/{courseId}/completions/applications/{appId}/reject` — tags: [Certificates]
- `POST /courses/{courseId}/completions/applications/{appId}/mint` — tags: [Certificates]

All with security: bearerAuth.

- [ ] **Step 2: Add @openapi to `src/routes/publicCredentials.ts`**

Mounted at `/api/v1` — paths:
- `GET /credentials/public` — tags: [Certificates], NO security (public), query: wallet (required)
- `GET /credentials/mine` — tags: [Certificates], security: bearerAuth

- [ ] **Step 3: Add @openapi to `src/routes/payments.ts`**

Mounted at `/api/v1` — paths:
- `GET /courses/{courseId}/pricing` — tags: [Payments]
- `PUT /admin/courses/{courseId}/pricing` — tags: [Payments]
- `POST /admin/payments/{paymentId}/confirm` — tags: [Payments]
- `POST /admin/payments/{paymentId}/waive` — tags: [Payments]
- `GET /admin/payments` — tags: [Payments], query: status, courseId
- `POST /payments/checkout/paystack` — tags: [Payments]
- `POST /payments/checkout/stellar` — tags: [Payments]
- `GET /payments/{paymentId}/status` — tags: [Payments]
- `GET /payments/mine` — tags: [Payments]
- `GET /payments/{paymentId}/receipt` — tags: [Payments], produces: application/pdf
- `POST /admin/payments/{paymentId}/refund` — tags: [Payments]
- `GET /courses/{courseId}/tiers` — tags: [Payments]
- `GET /badges/{badgeId}` — tags: [Payments]
- `GET /badges/{badgeId}/download` — tags: [Payments]

All (except pricing GET) with security: bearerAuth.

- [ ] **Step 4: Add @openapi to `src/routes/cohorts.ts`**

Mounted at `/api/v1` — all paths under `/admin/cohorts`:
- `POST /admin/cohorts` — tags: [Cohorts]
- `GET /admin/cohorts` — tags: [Cohorts], query: courseId
- `GET /admin/cohorts/spending-report` — tags: [Cohorts]
- `GET /admin/cohorts/{cohortId}` — tags: [Cohorts]
- `POST /admin/cohorts/{cohortId}/members` — tags: [Cohorts]
- `DELETE /admin/cohorts/{cohortId}/members/{userId}` — tags: [Cohorts]
- `POST /admin/cohorts/{cohortId}/apply` — tags: [Cohorts]
- `POST /admin/cohorts/{cohortId}/pay` — tags: [Cohorts]
- `PATCH /admin/cohorts/{cohortId}/status` — tags: [Cohorts]
- `GET /admin/cohorts/{cohortId}/status-log` — tags: [Cohorts]
- `POST /admin/cohorts/{cohortId}/invite` — tags: [Cohorts]
- `POST /admin/cohorts/{cohortId}/send-reminder` — tags: [Cohorts]

All with security: bearerAuth.

- [ ] **Step 5: Add @openapi to `src/routes/analytics.ts`**

Mounted at `/api/v1/analytics` — paths:
- `GET /analytics/dashboard` — tags: [Analytics]
- `GET /analytics/courses` — tags: [Analytics]
- `GET /analytics/quizzes` — tags: [Analytics]
- `GET /analytics/courses/export` — tags: [Analytics], produces: text/csv
- `GET /analytics/courses/{courseId}/students` — tags: [Analytics]
- `GET /analytics/payments` — tags: [Analytics]

All with security: bearerAuth.

- [ ] **Step 6: Run tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add src/routes/nftApplications.ts src/routes/publicCredentials.ts src/routes/payments.ts src/routes/cohorts.ts src/routes/analytics.ts
git commit -m "docs(phase23-c2): add @openapi annotations — certificates, payments, cohorts, analytics"
```

---

### Task 5: Add @openapi Annotations — Documents, Announcements, Forum, Messages, Notifications, Invites, Wallet

**Files:**
- Modify: `src/routes/documents.ts`
- Modify: `src/routes/announcements.ts`
- Modify: `src/routes/forum.ts`
- Modify: `src/routes/messages.ts`
- Modify: `src/routes/notifications.ts`
- Modify: `src/routes/invites.ts`
- Modify: `src/routes/walletStatus.ts`

**Interfaces:**
- Produces: OpenAPI paths for Documents (7), Announcements (4), Forum (5), Messages (7), Notifications (2), Invites (5), Wallet (1)

- [ ] **Step 1: Add @openapi to `src/routes/documents.ts`**

Mounted at `/api/v1/documents`:
- `GET /documents/categories` — tags: [Documents]
- `GET /documents` — tags: [Documents], query: page, limit, category
- `GET /documents/{id}` — tags: [Documents]
- `GET /documents/{id}/download` — tags: [Documents]
- `POST /documents` — tags: [Documents], requestBody: multipart/form-data
- `PUT /documents/{id}` — tags: [Documents]
- `DELETE /documents/{id}` — tags: [Documents]

- [ ] **Step 2: Add @openapi to `src/routes/announcements.ts`**

Mounted at `/api/v1/announcements`:
- `GET /announcements` — tags: [Announcements]
- `POST /announcements` — tags: [Announcements]
- `PATCH /announcements/{id}` — tags: [Announcements]
- `DELETE /announcements/{id}` — tags: [Announcements]

- [ ] **Step 3: Add @openapi to `src/routes/forum.ts`**

Mounted at `/api/v1/forum`:
- `GET /forum/topics` — tags: [Forum]
- `GET /forum/topics/{id}` — tags: [Forum]
- `GET /forum/topics/{topicId}/posts` — tags: [Forum]
- `POST /forum/topics` — tags: [Forum]
- `POST /forum/topics/{topicId}/posts` — tags: [Forum]

- [ ] **Step 4: Add @openapi to `src/routes/messages.ts`**

Mounted at `/api/v1/messages`:
- `GET /messages/unread-count` — tags: [Messages]
- `GET /messages/conversations` — tags: [Messages]
- `POST /messages/conversations` — tags: [Messages]
- `GET /messages/conversations/{id}` — tags: [Messages]
- `GET /messages/conversations/{id}/messages` — tags: [Messages]
- `POST /messages/conversations/{id}/messages` — tags: [Messages]
- `POST /messages/conversations/{id}/read` — tags: [Messages]

- [ ] **Step 5: Add @openapi to `src/routes/notifications.ts`**

Mounted at `/api/v1`:
- `GET /notifications` — tags: [Notifications]
- `PUT /notifications/{id}/read` — tags: [Notifications]

- [ ] **Step 6: Add @openapi to `src/routes/invites.ts`**

Mounted at `/api/v1`:
- `GET /accept` — tags: [Invites], query: token
- `POST /accept` — tags: [Invites]
- `POST /courses/{courseId}/invite` — tags: [Invites]
- `GET /courses/{courseId}/invites` — tags: [Invites]
- `DELETE /courses/{courseId}/invites/{inviteId}` — tags: [Invites]

- [ ] **Step 7: Add @openapi to `src/routes/walletStatus.ts`**

Mounted at `/api/v1`:
- `GET /wallet/status` — tags: [Wallet]

- [ ] **Step 8: Run tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add src/routes/documents.ts src/routes/announcements.ts src/routes/forum.ts src/routes/messages.ts src/routes/notifications.ts src/routes/invites.ts src/routes/walletStatus.ts
git commit -m "docs(phase23-c2): add @openapi annotations — documents, announcements, forum, messages, notifications, invites, wallet"
```

---

### Task 6: Add @openapi Annotations — Admin, RBAC, Tenants, Email Templates, Webhooks, Health

**Files:**
- Modify: `src/routes/admin.ts`
- Modify: `src/routes/rbac.ts`
- Modify: `src/routes/tenants.ts`
- Modify: `src/routes/emailTemplates.ts`
- Modify: `src/routes/webhooks.ts`
- Modify: `src/app.ts` (health check annotations)

**Interfaces:**
- Produces: OpenAPI paths for Admin (5), RBAC (10), Tenants (7), Email Templates (4), Webhooks (1), Health (3)

- [ ] **Step 1: Add @openapi to `src/routes/admin.ts`**

Mounted at `/api/v1/admin`:
- `GET /admin/integration-status` — tags: [Admin]
- `GET /admin/certificates` — tags: [Admin]
- `GET /admin/issued-credentials` — tags: [Admin]
- `GET /admin/demo-sponsor-transfers` — tags: [Admin]
- `POST /admin/credentials/{credentialId}/remint` — tags: [Admin]

- [ ] **Step 2: Add @openapi to `src/routes/rbac.ts`**

Mounted at `/api/v1/admin`:
- `GET /admin/roles` — tags: [RBAC]
- `POST /admin/roles` — tags: [RBAC], requestBody: name, label, description
- `PUT /admin/roles/{id}` — tags: [RBAC]
- `DELETE /admin/roles/{id}` — tags: [RBAC]
- `GET /admin/permissions` — tags: [RBAC]
- `GET /admin/roles/{id}/permissions` — tags: [RBAC]
- `PUT /admin/roles/{id}/permissions` — tags: [RBAC], requestBody: permissionIds
- `GET /admin/users/{id}/roles` — tags: [RBAC]
- `POST /admin/users/{id}/roles` — tags: [RBAC], requestBody: roleId
- `DELETE /admin/users/{id}/roles/{roleId}` — tags: [RBAC]

- [ ] **Step 3: Add @openapi to `src/routes/tenants.ts`**

Mounted at `/api/v1/admin/tenants`:
- `GET /admin/tenants` — tags: [Tenants]
- `POST /admin/tenants` — tags: [Tenants], requestBody: name, slug
- `PUT /admin/tenants/{id}` — tags: [Tenants]
- `DELETE /admin/tenants/{id}` — tags: [Tenants]
- `GET /admin/tenants/{id}/users` — tags: [Tenants]
- `POST /admin/tenants/{id}/users` — tags: [Tenants], requestBody: userId, tenantRole
- `DELETE /admin/tenants/{id}/users/{userId}` — tags: [Tenants]

- [ ] **Step 4: Add @openapi to `src/routes/emailTemplates.ts`**

Mounted at `/api/v1`:
- `GET /admin/email-templates` — tags: [Email Templates], query: category
- `GET /admin/email-templates/{slug}` — tags: [Email Templates]
- `PUT /admin/email-templates/{slug}` — tags: [Email Templates], requestBody: subject, bodyHtml
- `POST /admin/email-templates/{slug}/preview` — tags: [Email Templates]

- [ ] **Step 5: Add @openapi to `src/routes/webhooks.ts`**

Mounted at `/api/v1/webhooks`:
- `POST /webhooks/paystack` — tags: [Webhooks], NO security (webhook), requestBody: raw JSON (Paystack event payload)

- [ ] **Step 6: Add @openapi health check annotations to `src/app.ts`**

Add above the health check route handlers:

```typescript
/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     servers:
 *       - url: /
 *     responses:
 *       200: { description: Service healthy }
 */

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check (API-prefixed)
 *     servers:
 *       - url: /
 *     responses:
 *       200: { description: Service healthy }
 */

/**
 * @openapi
 * /healthz:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     servers:
 *       - url: /
 *     responses:
 *       200: { description: Service ready }
 *       503: { description: Service not ready }
 */
```

- [ ] **Step 7: Run tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/routes/admin.ts src/routes/rbac.ts src/routes/tenants.ts src/routes/emailTemplates.ts src/routes/webhooks.ts src/app.ts
git commit -m "docs(phase23-c2): add @openapi annotations — admin, rbac, tenants, email templates, webhooks, health"
```

---

### Task 7: Verification + Tag + Closeout

**Files:** None created/modified (verification only, unless fixes needed)

- [ ] **Step 1: Run full backend test suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
```

Expected: 613 tests pass (609 + 4 new).

- [ ] **Step 2: Run TypeScript check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
```

- [ ] **Step 3: Run frontend tests (no changes expected)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 125 tests pass (unchanged).

- [ ] **Step 4: Frontend TypeScript check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

- [ ] **Step 5: Vite production build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build
```

- [ ] **Step 6: Verify spec endpoint**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && node -e "
import('./src/config/swagger.js').then(m => {
  const spec = m.swaggerSpec;
  console.log('OpenAPI version:', spec.openapi);
  console.log('Tags:', spec.tags?.length);
  console.log('Paths:', Object.keys(spec.paths || {}).length);
})" 2>/dev/null || tsx -e "
import { swaggerSpec } from './src/config/swagger.js';
console.log('OpenAPI version:', swaggerSpec.openapi);
console.log('Tags:', swaggerSpec.tags?.length);
console.log('Paths:', Object.keys(swaggerSpec.paths || {}).length);
"
```

Expected: 26 tags, 100+ paths.

- [ ] **Step 7: Run E2E tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e && npx playwright test
```

Expected: 14 tests pass (unchanged).

- [ ] **Step 8: Tag release**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git tag phase23-c2-complete-2026-08-06
```

- [ ] **Step 9: Write closeout document**

Create `docs/superpowers/plans/2026-08-06-phase23-c2-closeout.md` with:
- Summary of changes
- Files changed count
- Test results
- Deferred items (none expected)
- Next target: Phase 23 C3 (Notifications v2) or C4 (NFT badges)
