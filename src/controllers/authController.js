
import crypto from 'node:crypto';

import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_SESSION_SECRET } from '../config.js';

import {
  UserModel,
  isMongoConnected,
  memoryUsers
} from '../models/database.js';


export const getAuthDemoUsers = (_req, res) => {
  res.json({
    demoAccounts: [
      {
        name: 'Sudipto Bordhon',
        email: 'sudipto@mindcare.app',
        password: 'mindcare123',
        role: 'user',
        badge: 'Regular User (14-Day History)',
        ageBand: 'adult'
      },
      {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        role: 'super_admin',
        badge: 'System Administrator',
        ageBand: 'adult'
      }
    ]
  });
};


export const postAuthRegister = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      ageBand = 'adult',
      preferredLanguage = 'bn',
      phone
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Name, email, and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user exists
    if (isMongoConnected) {
      const existing = await UserModel.findOne({
        email: cleanEmail
      });

      if (existing) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please sign in.'
        });
      }

    } else {
      const existingMem = memoryUsers.find(
        u => u.email.toLowerCase() === cleanEmail
      );

      if (existingMem) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please sign in.'
        });
      }
    }

    const newUserObj = {
      id: 'usr_' + Date.now(),
      name: name.trim(),
      email: cleanEmail,
      password: password.trim(),
      phone: phone || '',
      ageBand,
      preferredLanguage,
      theme: 'light',
      role: 'user',
      streakDays: 0,
      createdAt: new Date().toISOString().split('T')[0]
    };

    if (isMongoConnected) {
      await UserModel.create(newUserObj);
    }

    // Always sync in-memory for zero latency
    memoryUsers.push(newUserObj);

    // Exclude password in response
    const { password: _, ...safeUser } = newUserObj;

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      user: safeUser,
      database: isMongoConnected ? 'MongoDB' : 'Memory'
    });

  } catch (error) {
    console.error('Registration error:', error);

    res.status(500).json({
      error: 'Server error creating account. Please try again.'
    });
  }
};


export const postAuthLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    let matchedUser = null;

    if (isMongoConnected) {
      const dbUser = await UserModel.findOne({
        email: cleanEmail
      });

      if (dbUser && dbUser.password === cleanPassword) {
        matchedUser = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          password: dbUser.password,
          phone: dbUser.phone,
          ageBand: dbUser.ageBand,
          preferredLanguage: dbUser.preferredLanguage,
          theme: dbUser.theme,
          role: dbUser.role,
          streakDays: dbUser.streakDays,
          createdAt: dbUser.createdAt
        };
      }
    }

    // Fallback to memoryUsers if not found or MongoDB offline
    if (!matchedUser) {
      const memUser = memoryUsers.find(
        u =>
          u.email.toLowerCase() === cleanEmail &&
          u.password === cleanPassword
      );

      if (memUser) {
        matchedUser = memUser;
      }
    }

    if (!matchedUser) {
      return res.status(401).json({
        error: 'Invalid email or password. Please try again or use the demo login credentials.'
      });
    }

    const { password: _, ...safeUser } = matchedUser;

    if (
      matchedUser.role === 'admin' ||
      matchedUser.role === 'super_admin'
    ) {
      const payload = Buffer.from(
        JSON.stringify({
          userId: matchedUser.id,
          role: matchedUser.role,
          expiresAt: Date.now() + (8 * 60 * 60 * 1000),
        })
      ).toString('base64url');

      const signature = crypto
        .createHmac('sha256', ADMIN_SESSION_SECRET)
        .update(payload)
        .digest('base64url');

      safeUser.adminToken = `${payload}.${signature}`;
    }

    return res.json({
      success: true,
      message: 'Login successful!',
      user: safeUser
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      error: 'Server error during sign in.'
    });
  }
};
