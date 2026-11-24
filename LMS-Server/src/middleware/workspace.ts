import { Response, NextFunction } from 'express';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { getAuthorizationContext, type Workspace } from '../services/authorizationService.js';

/**
 * Refuses a signed-in user who does not hold the given workspace (or the admin one).
 * The parent, teacher and employer APIs check permissions such as student.view_assigned and
 * reward.view_assigned, which sponsors also hold; the permission alone must not open another
 * role's dashboard. Must run after authenticate().
 */
export function requireWorkspace(workspace: Workspace) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: ErrorCodes.UNAUTHORIZED, message: 'Authentication required' } });
      return;
    }
    const { workspaces } = getAuthorizationContext(req.user.userId);
    if (!workspaces.includes(workspace) && !workspaces.includes('admin')) {
      res.status(403).json({ success: false, error: { code: ErrorCodes.FORBIDDEN, message: `This page is for ${workspace} accounts` } });
      return;
    }
    next();
  };
}
