import { Router } from 'express';
import * as controller from '../controllers/aiController';

const router = Router();

router.post('/chat', controller.postChat);
router.post('/stress-analysis', controller.postStressAnalysis);
router.post('/weekly-integrated-report', controller.postWeeklyIntegratedReport);
router.post('/journal-reflection', controller.postJournalReflection);

export default router;
