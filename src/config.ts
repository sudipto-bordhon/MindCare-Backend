import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@mindcare.app').trim().toLowerCase();
export const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();
export const ADMIN_NAME = (process.env.ADMIN_NAME || 'MindCare System Administrator').trim();
export const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD || 'mindcare-admin-session-secret';
