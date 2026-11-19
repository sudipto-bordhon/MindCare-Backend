import { Router } from 'express';
import * as controller from '../controllers/authController.js';

const router = Router();

router.get('/demo-users', controller.getAuthDemoUsers);
router.post('/register', controller.postAuthRegister);
router.post('/login', controller.postAuthLogin);

export default router;