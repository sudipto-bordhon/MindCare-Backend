
import mongoose from 'mongoose';
import { INITIAL_CRISIS_HELPLINES } from '../../crisisHelplines.js';
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } from '../config.js';

// =====================================================
// MongoDB Configuration
// =====================================================

const MONGODB_URI = process.env.MONGODB_URI || '';

export let isMongoConnected = false;

// Reuse existing models safely and preserve their collection names.
function getModel(name, schema) {
  const existing = mongoose.models[name];
  return existing || mongoose.model(name, schema);
}

// =====================================================
// User Model
// =====================================================

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  ageBand: { type: String, default: 'adult' },
  preferredLanguage: { type: String, default: 'bn' },
  theme: { type: String, default: 'light' },
  role: { type: String, default: 'user' },
  streakDays: { type: Number, default: 1 },
  createdAt: {
    type: String,
    default: () => new Date().toISOString().split('T')[0]
  }
});

export const UserModel = getModel('User', userSchema);

// =====================================================
// Ambient Soundscape Model
// =====================================================

const soundscapeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  titleEn: { type: String, required: true },
  titleBn: { type: String, required: true },
  audioFileName: { type: String },
  contentType: { type: String },
  audioData: { type: Buffer, select: false },
  audioCloudinaryId: { type: String },
  audioUrl: { type: String },
  pendingCloudinaryDeletions: {
    type: [{
      publicId: { type: String, required: true },
      resourceType: {
        type: String,
        enum: ['image', 'video', 'raw'],
        required: true
      }
    }],
    default: []
  },
  soundType: {
    type: String,
    enum: ['rain', 'ocean', 'forest', 'birds', 'whitenoise']
  },
  createdAt: { type: Date, default: Date.now }
});

export const SoundscapeModel = getModel(
  'AmbientSoundscape',
  soundscapeSchema
);

export const BUILT_IN_SOUND_TYPES = {
  rain: 'rain',
  ocean: 'ocean',
  forest: 'forest',
  birds: 'birds',
  whitenoise: 'whitenoise'
};

// =====================================================
// About Team Member Model
// =====================================================

const aboutTeamMemberSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  position: { type: String, default: '' },
  university: { type: String, default: '' },
  socialLinks: {
    facebook: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    instagram: { type: String, default: '' },
    twitter: { type: String, default: '' }
  },
  imageContentType: { type: String },
  imageData: { type: Buffer, select: false },
  imageCloudinaryId: { type: String },
  imageUrl: { type: String },
  cvFileName: { type: String },
  cvContentType: { type: String },
  cvData: { type: Buffer, select: false },
  cvCloudinaryId: { type: String },
  cvUrl: { type: String },
  pendingCloudinaryDeletions: {
    type: [{
      publicId: { type: String, required: true },
      resourceType: {
        type: String,
        enum: ['image', 'video', 'raw'],
        required: true
      }
    }],
    default: []
  },
  updatedAt: { type: Date, default: Date.now }
});

export const AboutTeamMemberModel = getModel(
  'AboutTeamMember',
  aboutTeamMemberSchema
);

// =====================================================
// About Team Configuration
// =====================================================

export const DEFAULT_ABOUT_TEAM_MEMBER_IDS = [
  'member-1',
  'member-2',
  'member-3'
];

const aboutTeamConfigSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  memberIds: { type: [String], default: [] }
});

export const AboutTeamConfigModel = getModel(
  'AboutTeamConfig',
  aboutTeamConfigSchema
);

// =====================================================
// Crisis Helpline Configuration
// =====================================================

const crisisHelplineSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    nameEn: { type: String, default: '' },
    nameBn: { type: String, default: '' },
    descriptionEn: { type: String, default: '' },
    descriptionBn: { type: String, default: '' },
    phone: { type: String, required: true }
  },
  { _id: false }
);

const crisisHelplineConfigSchema =
  new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    helplines: { type: [crisisHelplineSchema], default: [] }
  });

export const CrisisHelplineConfigModel =
  getModel(
    'CrisisHelplineConfig',
    crisisHelplineConfigSchema
  );

// =====================================================
// Donation Settings
// =====================================================

export const DEFAULT_DONATION_SETTINGS = {
  bkashNumber: '01795398332',
  enabled: true
};

const donationSettingsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  bkashNumber: {
    type: String,
    required: true,
    default: DEFAULT_DONATION_SETTINGS.bkashNumber
  },
  enabled: {
    type: Boolean,
    default: DEFAULT_DONATION_SETTINGS.enabled
  },
  changeHistory: {
    type: [{
      adminId: { type: String, required: true },
      adminName: { type: String, required: true },
      adminEmail: { type: String, required: true },
      previousBkashNumber: { type: String, required: true },
      bkashNumber: { type: String, required: true },
      previousEnabled: { type: Boolean, required: true },
      enabled: { type: Boolean, required: true },
      changedAt: { type: Date, required: true }
    }],
    default: []
  }
});

export const DonationSettingsModel = getModel(
  'DonationSettings',
  donationSettingsSchema
);

// AI Provider Key Configuration

const encryptedAIKeySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    encryptedKey: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    lastFour: { type: String, required: true }
  },
  { _id: false }
);

const customAIProviderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    keys: { type: [encryptedAIKeySchema], default: [] },
    integration: { type: String, enum: ['openrouter'] },
    model: { type: String },
    enabledForAI: { type: Boolean, default: false },
    preferredKeyId: { type: String }
  },
  { _id: false }
);

const aiProviderKeyConfigSchema =
  new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    geminiKeys: { type: [encryptedAIKeySchema], default: [] },
    openaiKeys: { type: [encryptedAIKeySchema], default: [] },
    useGeminiEnvironmentKeys: { type: Boolean, default: true },
    useOpenAIEnvironmentKeys: { type: Boolean, default: true },
    preferredGeminiKeyId: { type: String },
    preferredOpenAIKeyId: { type: String },
    customProviders: { type: [customAIProviderSchema], default: [] }
  });

export const AIProviderKeyConfigModel =
  getModel(
    'AIProviderKeyConfig',
    aiProviderKeyConfigSchema
  );

// =====================================================
// About Team Helper
// =====================================================

export async function getAboutTeamMemberIds() {
  const config = await AboutTeamConfigModel.findOneAndUpdate(
    { id: 'about-team' },
    { $setOnInsert: { memberIds: DEFAULT_ABOUT_TEAM_MEMBER_IDS } },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true
    }
  ).lean();

  return config?.memberIds || DEFAULT_ABOUT_TEAM_MEMBER_IDS;
}

// =====================================================
// Crisis Helpline Helper
// =====================================================

export async function loadCrisisHelplines() {
  const config = await CrisisHelplineConfigModel.findOneAndUpdate(
    { id: 'crisis-helplines' },
    { $setOnInsert: { helplines: INITIAL_CRISIS_HELPLINES } },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true
    }
  ).lean();

  return config?.helplines || [];
}

// =====================================================
// Donation Settings Helper
// =====================================================

export async function loadDonationSettings() {
  const settings = await DonationSettingsModel.findOneAndUpdate(
    { id: 'donations' },
    { $setOnInsert: DEFAULT_DONATION_SETTINGS },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true
    }
  ).lean();

  if (!settings) {
    throw new Error('Donation settings could not be loaded.');
  }

  return {
    ...settings,
    changeHistory: settings.changeHistory || []
  };
}

// =====================================================
// In-memory Fallback and Seed Accounts
// =====================================================

export const memoryUsers = [
  {
    id: 'user_sudipto',
    name: 'Sudipto Bordhon',
    email: 'sudipto@mindcare.app',
    password: 'mindcare123',
    phone: '+880 1712 345678',
    ageBand: 'adult',
    preferredLanguage: 'bn',
    theme: 'light',
    role: 'user',
    streakDays: 0,
    createdAt: '2026-10-15'
  },
  {
    id: 'user_system_admin',
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    phone: '+880 1819 876543',
    ageBand: 'adult',
    preferredLanguage: 'en',
    theme: 'light',
    role: 'super_admin',
    streakDays: 0,
    createdAt: new Date().toISOString().split('T')[0]
  }
];

// =====================================================
// Seed Initial Users into MongoDB
// =====================================================

async function seedDefaultUsers() {
  if (!isMongoConnected) return;

  try {
    for (const user of memoryUsers) {
      if (user.email === ADMIN_EMAIL) {
        await UserModel.updateOne(
          { email: ADMIN_EMAIL },
          {
            $set: {
              id: user.id,
              name: user.name,
              password: user.password,
              phone: user.phone,
              ageBand: user.ageBand,
              preferredLanguage: user.preferredLanguage,
              theme: user.theme,
              role: 'super_admin',
              streakDays: user.streakDays
            },
            $setOnInsert: {
              createdAt: user.createdAt
            }
          },
          { upsert: true }
        );
      } else {
        const existing = await UserModel.findOne({
          email: user.email.toLowerCase()
        });

        if (!existing) {
          await UserModel.create(user);
        }
      }
    }

    console.log(
      `Default users seeded in MongoDB. System admin: ${ADMIN_EMAIL}`
    );
  } catch (err) {
    console.warn(
      'Notice: Error seeding default users in MongoDB:',
      err
    );
  }
}

// =====================================================
// MongoDB Connection
// =====================================================

if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    })
    .then(() => {
      isMongoConnected = true;

      console.log('MongoDB successfully connected to Atlas cluster!');

      void seedDefaultUsers();
    })
    .catch((err) => {
      isMongoConnected = false;

      console.warn(
        'MongoDB connection failed; using the in-memory fallback. Check MONGODB_URI, Node.js DNS/network access, and the Atlas IP access list:',
        err.message
      );
    });
} else {
  console.warn(
    'MongoDB URI is not configured; running with the in-memory database.'
  );
}
