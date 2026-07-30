import { Response, NextFunction } from 'express';
import { queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_PROFILE_COLUMNS = new Set([
  'whatsapp', 'telegram', 'linkedin_url', 'github_url',
  'twitter_url', 'website_url', 'custom_links',
]);

// ── Avatar upload config ────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const avatarUploadMiddleware = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    if (ok) { cb(null, true); } else { cb(new Error('Only image files are allowed')); }
  },
}).single('avatar');

// ── Types ───────────────────────────────────────────────────────────────────

interface UserRow { id: string; name: string; description: string | null }
interface ProfileRow {
  avatar_path: string | null;
  whatsapp: string | null;
  telegram: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
  custom_links: string | null;
}

interface CustomLink { title: string; url: string }

function parseLinks(raw: string | null): CustomLink[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as CustomLink[]; }
  catch { return []; }
}

function buildProfileResponse(user: UserRow, profile: ProfileRow | null, baseUrl: string) {
  return {
    id: user.id,
    displayName: user.name,
    description: user.description ?? '',
    avatarUrl: profile?.avatar_path
      ? `${baseUrl}/uploads/avatars/${path.basename(profile.avatar_path)}`
      : null,
    whatsapp: profile?.whatsapp ?? null,
    telegram: profile?.telegram ?? null,
    linkedinUrl: profile?.linkedin_url ?? null,
    githubUrl: profile?.github_url ?? null,
    twitterUrl: profile?.twitter_url ?? null,
    websiteUrl: profile?.website_url ?? null,
    customLinks: parseLinks(profile?.custom_links ?? null),
  };
}

function getBaseUrl(req: AuthRequest): string {
  return process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
}

// ── Controllers ─────────────────────────────────────────────────────────────

/** GET /profile — own profile */
export async function getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    const user = queryOne<UserRow>('SELECT id, name, description FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    const profile = queryOne<ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
    res.json({ success: true, data: buildProfileResponse(user, profile, getBaseUrl(req)) });
  } catch (error) { next(error); }
}

/** GET /profile/:userId — any user's profile (authenticated) */
export async function getProfileById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.params;
    const user = queryOne<UserRow>('SELECT id, name, description FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    const profile = queryOne<ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
    res.json({ success: true, data: buildProfileResponse(user, profile, getBaseUrl(req)) });
  } catch (error) { next(error); }
}

/** PATCH /profile — update own profile fields */
export async function patchProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    const user = queryOne<UserRow>('SELECT id, name, description FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);

    const {
      name,
      description,
      whatsapp, telegram,
      linkedinUrl, githubUrl, twitterUrl, websiteUrl,
      customLinks,
    } = req.body ?? {};
    // Frontend sends displayName; accept as alias for name
    const nameField = name !== undefined ? name : (req.body as { displayName?: unknown })?.displayName;

    // Update users table
    const userUpdates: string[] = [];
    const userParams: unknown[] = [];
    if (nameField !== undefined) {
      const trimmed = String(nameField).trim();
      if (!trimmed) throw new AppError('Name cannot be empty', 400, ErrorCodes.VALIDATION_ERROR);
      userUpdates.push('name = ?');
      userParams.push(trimmed);
    }
    if (description !== undefined) {
      userUpdates.push('description = ?');
      userParams.push(typeof description === 'string' ? description.trim() : null);
    }
    if (userUpdates.length > 0) {
      userParams.push(userId);
      execute(`UPDATE users SET ${userUpdates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, userParams);
    }

    // Upsert user_profiles table
    const profileFields: Record<string, unknown> = {};
    if (whatsapp !== undefined) profileFields['whatsapp'] = whatsapp || null;
    if (telegram !== undefined) profileFields['telegram'] = telegram || null;
    if (linkedinUrl !== undefined) profileFields['linkedin_url'] = linkedinUrl || null;
    if (githubUrl !== undefined) profileFields['github_url'] = githubUrl || null;
    if (twitterUrl !== undefined) profileFields['twitter_url'] = twitterUrl || null;
    if (websiteUrl !== undefined) profileFields['website_url'] = websiteUrl || null;
    if (customLinks !== undefined) {
      profileFields['custom_links'] = JSON.stringify(
        Array.isArray(customLinks) ? customLinks : []
      );
    }

    for (const k of Object.keys(profileFields)) {
      if (!ALLOWED_PROFILE_COLUMNS.has(k)) {
        throw new AppError(`Invalid profile field: ${k}`, 400, ErrorCodes.VALIDATION_ERROR);
      }
    }

    if (Object.keys(profileFields).length > 0) {
      const existing = queryOne<{ user_id: string }>('SELECT user_id FROM user_profiles WHERE user_id = ?', [userId]);
      if (existing) {
        const setClauses = Object.keys(profileFields).map((k) => `${k} = ?`).join(', ');
        execute(
          `UPDATE user_profiles SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`,
          [...Object.values(profileFields), userId]
        );
      } else {
        const cols = ['user_id', ...Object.keys(profileFields)].join(', ');
        const placeholders = Array(Object.keys(profileFields).length + 1).fill('?').join(', ');
        execute(
          `INSERT INTO user_profiles (${cols}) VALUES (${placeholders})`,
          [userId, ...Object.values(profileFields)]
        );
      }
    }

    const updatedUser = queryOne<UserRow>('SELECT id, name, description FROM users WHERE id = ?', [userId]);
    if (!updatedUser) throw new AppError('User not found', 404, ErrorCodes.NOT_FOUND);
    const updatedProfile = queryOne<ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
    res.json({ success: true, data: buildProfileResponse(updatedUser, updatedProfile, getBaseUrl(req)) });
  } catch (error) { next(error); }
}

/** POST /profile/avatar — upload profile picture */
export async function uploadAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    if (!req.file) throw new AppError('No image file provided', 400, ErrorCodes.VALIDATION_ERROR);

    // Delete old avatar if any
    const existing = queryOne<{ avatar_path: string | null }>('SELECT avatar_path FROM user_profiles WHERE user_id = ?', [userId]);
    if (existing?.avatar_path && fs.existsSync(existing.avatar_path)) {
      fs.unlink(existing.avatar_path, () => {});
    }

    const filePath = req.file.path;
    const prevProfile = queryOne<{ user_id: string }>('SELECT user_id FROM user_profiles WHERE user_id = ?', [userId]);
    if (prevProfile) {
      execute('UPDATE user_profiles SET avatar_path = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [filePath, userId]);
    } else {
      execute('INSERT INTO user_profiles (user_id, avatar_path) VALUES (?, ?)', [userId, filePath]);
    }

    const avatarUrl = `${getBaseUrl(req)}/uploads/avatars/${path.basename(filePath)}`;
    res.json({ success: true, data: { avatarUrl } });
  } catch (error) { next(error); }
}
