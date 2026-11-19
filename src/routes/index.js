import { Router } from 'express';
import adminRoutes from './adminRoutes.js';
import aiRoutes from './aiRoutes.js';
import authRoutes from './authRoutes.js';
import publicRoutes from './publicRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use(aiRoutes);
router.use(publicRoutes);

export default router;