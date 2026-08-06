import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerDefinition: swaggerJsdoc.SwaggerDefinition = {
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
