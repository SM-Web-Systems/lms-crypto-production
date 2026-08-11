/**
 * Search route — Phase 26 C1.
 *
 * GET /search?q=<term>&types=<csv>&limit=<n>  — unified multi-entity search
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { globalSearch } from '../controllers/searchController.js';

const router = Router();

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Unified multi-entity search
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term (minimum 2 characters)
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: "Comma-separated entity types: courses,users,credentials,quizzes"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *         description: Max results per type
 *     responses:
 *       '200':
 *         description: Categorized search results
 *       '400':
 *         description: Missing or invalid q parameter
 *       '401':
 *         description: Authentication required
 */
router.get('/search', authenticate, globalSearch);

export default router;
