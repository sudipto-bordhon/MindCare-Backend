import { Router } from 'express';
import adminRoutes from './adminRoutes';import aiRoutes from './aiRoutes';import authRoutes from './authRoutes';import publicRoutes from './publicRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use(aiRoutes);
router.use(publicRoutes);

export default router;
