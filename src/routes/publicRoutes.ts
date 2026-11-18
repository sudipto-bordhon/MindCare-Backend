import { Router } from 'express';
import * as controller from '../controllers/publicController';

const router = Router();

router.get('/health', controller.getHealth);
router.get('/db-status', controller.getDbStatus);
router.get('/about/team', controller.getAboutTeam);
router.get('/donation-settings', controller.getDonationSettings);
router.get('/crisis-helplines', controller.getCrisisHelplines);
router.get('/about/team-image', controller.getAboutTeamImage);
router.get('/about/team-cv', controller.getAboutTeamCv);
router.get('/soundscapes', controller.getSoundscapes);
router.get('/soundscapes/:id/audio', controller.getSoundscapesByIdAudio);

export default router;
