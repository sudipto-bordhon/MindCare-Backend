
import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth.js';
import * as controller from '../controllers/adminController.js';

const router = Router();

/* router.use(requireAdmin); */

router.get('/users', controller.getAdminUsers);
router.patch('/users/:id', controller.patchAdminUsersById);
router.delete('/users/:id', controller.deleteAdminUsersById);

router.get('/ai-keys', controller.getAdminAIKeys);
router.post('/ai-keys', controller.postAdminAIKeys);
router.patch('/ai-keys', controller.patchAdminAIKeys);

router.post('/ai-keys/custom', controller.postAdminCustomAIProvider);
router.patch('/ai-keys/custom/:id', controller.patchAdminCustomAIProvider);
router.delete('/ai-keys/custom/:id', controller.deleteAdminCustomAIProvider);

router.post('/ai-keys/custom/:id/keys', controller.postAdminCustomAIProviderKeys);
router.patch('/ai-keys/custom/:providerId/keys/:keyId', controller.patchAdminCustomAIProviderKey);
router.delete('/ai-keys/custom/:providerId/keys/:keyId', controller.deleteAdminCustomAIProviderKey);

router.patch('/ai-keys/custom/:providerId/preferred-key', controller.patchAdminCustomAIProviderPreferredKey);

router.patch('/ai-keys/:provider/:id', controller.patchAdminAIKey);
router.delete('/ai-keys/:provider/:id', controller.deleteAdminAIKey);

router.get('/crisis-helplines', controller.getAdminCrisisHelplines);
router.put('/crisis-helplines', controller.putAdminCrisisHelplines);

router.get('/donation-settings', controller.getAdminDonationSettings);
router.put('/donation-settings', controller.putAdminDonationSettings);

router.get('/about-team', controller.getAdminAboutTeam);
router.put('/about-team', controller.putAdminAboutTeam);
router.post('/about-team', controller.postAdminAboutTeam);
router.delete('/about-team', controller.deleteAdminAboutTeam);

router.get('/soundscapes', controller.getAdminSoundscapes);
router.post('/soundscapes', controller.postAdminSoundscapes);
router.patch('/soundscapes', controller.patchAdminSoundscapes);
router.delete('/soundscapes', controller.deleteAdminSoundscapes);

export default router;
