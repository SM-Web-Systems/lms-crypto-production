import {Router,type NextFunction,type Response} from 'express';
import {authenticate} from '../middleware/auth.js';
import {requirePermission} from '../middleware/rbac.js';
import type {AuthRequest} from '../types/index.js';
import {RewardError} from '../services/rewards/rewardErrors.js';
import {platformCreditSummary,createBackingIntent,verifyBackingDeposit,requestPlatformCredit,approvePlatformCredit,
  cancelPlatformCreditRequest,listPlatformCredits,releasePlatformCreditReservation} from '../services/rewards/platformCreditService.js';

const router=Router();
router.use(authenticate,requirePermission('reward.manage'));
const handle=(action:(req:AuthRequest)=>unknown|Promise<unknown>)=>async(req:AuthRequest,res:Response,next:NextFunction)=>{
  try {res.json({success:true,data:await action(req)});}
  catch(err){if(err instanceof RewardError) res.status(err.statusCode).json({success:false,error:{code:err.code,message:err.message}});else next(err);}
};
router.get('/',handle(req=>platformCreditSummary(req.user!.userId)));
router.get('/credits/:owner',handle(req=>listPlatformCredits(req.user!.userId,req.params.owner)));
router.post('/deposit-intents',handle(req=>createBackingIntent(req.user!.userId,req.body.amountStroops,req.body.reason,req.body.idempotencyKey)));
router.post('/deposit-intents/:id/verify',handle(req=>verifyBackingDeposit(req.params.id,req.user!.userId,req.body.operationId)));
router.post('/requests',handle(req=>requestPlatformCredit(req.user!.userId,req.body.beneficiaryUserId,req.body.amountStroops,req.body.reason,req.body.idempotencyKey)));
router.post('/requests/:id/approve',handle(req=>approvePlatformCredit(req.params.id,req.user!.userId,req.body.idempotencyKey,req.body.reason)));
router.post('/requests/:id/cancel',handle(req=>cancelPlatformCreditRequest(req.params.id,req.user!.userId,req.body.reason)));
router.post('/reservations/:id/release',handle(req=>releasePlatformCreditReservation(req.params.id,req.user!.userId)));
export default router;
