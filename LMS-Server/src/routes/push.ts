import { Router, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { PushError, pushConfiguration, registerInstallation, unregisterInstallation } from '../services/pushInstallationService.js';
import { queryOne } from '../config/database.js';

const router=Router();
const cleanupLimiter=rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-8',legacyHeaders:false});
function handle(work:(req:AuthRequest)=>unknown) {
  return (req:AuthRequest,res:Response,next:NextFunction)=>{
    try {res.json({success:true,data:work(req)});}
    catch(error){if(error instanceof PushError)res.status(error.status).json({success:false,error:{code:error.code,message:error.message}});else next(error);}
  };
}
router.get('/notifications/push/config',authenticate,handle(()=>{
  const {enabled,projectId}=pushConfiguration();return {enabled,projectId:enabled?projectId:null};
}));
router.put('/notifications/push/installation',authenticate,handle(req=>registerInstallation(req.body,req.headers.authorization!.slice(7))));
// High-entropy per-installation credential, independent of expired/revoked JWTs. Never echo it or the token.
router.post('/notifications/push/unregister',cleanupLimiter,handle(req=>unregisterInstallation(req.body)));
router.get('/notifications/:id',authenticate,handle(req=>{
  const row=queryOne('SELECT id,type,title,body,link,read,created_at FROM notifications WHERE id=? AND user_id=?',[req.params.id,req.user!.userId]);
  if(!row)throw new PushError(404,'NOT_FOUND','Notification not found.');
  return {notification:row};
}));
export default router;
