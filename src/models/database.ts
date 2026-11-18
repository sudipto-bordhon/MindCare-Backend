
import mongoose from 'mongoose';
import { INITIAL_CRISIS_HELPLINES, type CrisisHelpline } from '../../crisisHelplines';
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } from '../config';

// =====================================================
// MongoDB Configuration
// =====================================================

const MONGODB_URI = process.env.MONGODB_URI || '';

export let isMongoConnected = false;

// Reuse existing models safely and preserve their collection names.
function getModel<T>(
  name: string,
  schema: mongoose.Schema<T>
): mongoose.Model<T> {
  const existing = mongoose.models[name] as mongoose.Model<T> | undefined;
  return existing || mongoose.model<T>(name, schema);
}

// =====================================================
// User Model
// =====================================================

export interface AppUser {
  id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  ageBand: string;
  preferredLanguage: string;
  theme: string;
  role: string;
  streakDays: number;
  createdAt: string;
}

const userSchema = new mongoose.Schema<AppUser>({
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

export const UserModel = getModel<AppUser>('User', userSchema);

// =====================================================
// Ambient Soundscape Model
// =====================================================

export interface AmbientSoundscapeRecord {
  id: string;
  titleEn: string;
  titleBn: string;
  audioFileName?: string;
  contentType?: string;
  audioData?: Buffer;
  audioCloudinaryId?: string;
  audioUrl?: string;
  pendingCloudinaryDeletions?: {
    publicId: string;
    resourceType: 'image' | 'video' | 'raw';
  }[];
  soundType?: 'rain' | 'ocean' | 'forest' | 'birds' | 'whitenoise';
  createdAt: Date;
}

const soundscapeSchema = new mongoose.Schema<AmbientSoundscapeRecord>({
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

export const SoundscapeModel = getModel<AmbientSoundscapeRecord>(
  'AmbientSoundscape',
  soundscapeSchema
);

export const BUILT_IN_SOUND_TYPES: Record<
  string,
  NonNullable<AmbientSoundscapeRecord['soundType']>
> = {
  rain: 'rain',
  ocean: 'ocean',
  forest: 'forest',
  birds: 'birds',
  whitenoise: 'whitenoise'
};

// =====================================================
// About Team Member Model
// =====================================================

export interface AboutTeamMemberRecord {
  id: string;
  name: string;
  phone: string;
  position: string;
  university: string;
  socialLinks?: {
    facebook: string;
    linkedin: string;
    instagram: string;
    twitter: string;
  };
  imageContentType?: string;
  imageData?: Buffer;
  imageCloudinaryId?: string;
  imageUrl?: string;
  cvFileName?: string;
  cvContentType?: string;
  cvData?: Buffer;
  cvCloudinaryId?: string;
  cvUrl?: string;
  pendingCloudinaryDeletions?: {
    publicId: string;
    resourceType: 'image' | 'video' | 'raw';
  }[];
  updatedAt: Date;
}

const aboutTeamMemberSchema = new mongoose.Schema<AboutTeamMemberRecord>({
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

export const AboutTeamMemberModel = getModel<AboutTeamMemberRecord>(
  'AboutTeamMember',
  aboutTeamMemberSchema
);

// =====================================================
// About Team Configuration
// =====================================================

export interface AboutTeamConfigRecord {
  id: string;
  memberIds: string[];
}

export const DEFAULT_ABOUT_TEAM_MEMBER_IDS = [
  'member-1',
  'member-2',
  'member-3'
];

const aboutTeamConfigSchema = new mongoose.Schema<AboutTeamConfigRecord>({
  id: { type: String, required: true, unique: true },
  memberIds: { type: [String], default: [] }
});

export const AboutTeamConfigModel = getModel<AboutTeamConfigRecord>(
  'AboutTeamConfig',
  aboutTeamConfigSchema
);

// =====================================================
// Crisis Helpline Configuration
// =====================================================

export interface CrisisHelplineConfigRecord {
  id: string;
  helplines: CrisisHelpline[];
}

const crisisHelplineSchema = new mongoose.Schema<CrisisHelpline>(
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
  new mongoose.Schema<CrisisHelplineConfigRecord>({
    id: { type: String, required: true, unique: true },
    helplines: { type: [crisisHelplineSchema], default: [] }
  });

export const CrisisHelplineConfigModel =
  getModel<CrisisHelplineConfigRecord>(
    'CrisisHelplineConfig',
    crisisHelplineConfigSchema
  );

// =====================================================
// Donation Settings
// =====================================================

export interface DonationSettingsChangeRecord {
  adminId: string;
  adminName: string;
  adminEmail: string;
  previousBkashNumber: string;
  bkashNumber: string;
  previousEnabled: boolean;
  enabled: boolean;
  changedAt: Date;
}

export interface DonationSettingsRecord {
  id: string;
  bkashNumber: string;
  enabled: boolean;
  changeHistory: DonationSettingsChangeRecord[];
}

export const DEFAULT_DONATION_SETTINGS = {
  bkashNumber: '01795398332',
  enabled: true
};

const donationSettingsSchema = new mongoose.Schema<DonationSettingsRecord>({
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

export const DonationSettingsModel = getModel<DonationSettingsRecord>(
  'DonationSettings',
  donationSettingsSchema
);

// =====================================================
// AI Provider Key Configuration
// =====================================================

export interface EncryptedAIKeyRecord {
  id: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  lastFour: string;
}

export interface CustomAIProviderRecord {
  id: string;
  name: string;
  keys: EncryptedAIKeyRecord[];
  integration?: 'openrouter';
  model?: string;
  enabledForAI?: boolean;
  preferredKeyId?: string;
}

export interface AIProviderKeyConfigRecord {
  id: string;
  geminiKeys: EncryptedAIKeyRecord[];
  openaiKeys: EncryptedAIKeyRecord[];
  useGeminiEnvironmentKeys: boolean;
  useOpenAIEnvironmentKeys: boolean;
  preferredGeminiKeyId?: string;
  preferredOpenAIKeyId?: string;
  customProviders: CustomAIProviderRecord[];
}

const encryptedAIKeySchema = new mongoose.Schema<EncryptedAIKeyRecord>(
  {
    id: { type: String, required: true },
    encryptedKey: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    lastFour: { type: String, required: true }
  },
  { _id: false }
);

const customAIProviderSchema = new mongoose.Schema<CustomAIProviderRecord>(
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
  new mongoose.Schema<AIProviderKeyConfigRecord>({
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
  getModel<AIProviderKeyConfigRecord>(
    'AIProviderKeyConfig',
    aiProviderKeyConfigSchema
  );

// =====================================================
// About Team Helper
// =====================================================

export async function getAboutTeamMemberIds(): Promise<string[]> {
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

export async function loadCrisisHelplines(): Promise<CrisisHelpline[]> {
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

export async function loadDonationSettings(): Promise<DonationSettingsRecord> {
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

export const memoryUsers: AppUser[] = [
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

async function seedDefaultUsers(): Promise<void> {
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
    .catch((err: Error) => {
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
