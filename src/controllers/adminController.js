import { randomUUID } from 'node:crypto';
import { AboutTeamConfigModel, AboutTeamMemberModel, BUILT_IN_SOUND_TYPES, CrisisHelplineConfigModel, DEFAULT_ABOUT_TEAM_MEMBER_IDS, DonationSettingsModel, SoundscapeModel, UserModel, getAboutTeamMemberIds, isMongoConnected, loadCrisisHelplines, loadDonationSettings, memoryUsers } from '../models/database.js';
import { parseCrisisHelplines } from '../../crisisHelplines.js';
import { getPublicAboutTeamMember, getPublicSoundscape, safeUser } from '../services/presenters.js';
import { deleteCloudinaryAsset, uploadCloudinaryAsset } from '../services/cloudinaryStorage.js';
import { normalizeSocialLinks } from '../utils/socialLinks.js';
import { getAdminIdentity } from '../middleware/adminAuth.js';
import {
  addCustomAIProvider,
  addCustomAIProviderKeys,
  addAdminAIKeys,
  deleteCustomAIProvider,
  deleteCustomAIProviderKey,
  getAdminAIKeySettings,
  setPreferredCustomAIKey,
  replaceCustomAIProviderKey,
  removeAdminAIKey,
  replaceAdminAIKey,
  setPreferredAIKey,
  setUseEnvironmentAIKeys,
  updateCustomAIProviderSettings,
} from '../ai/keyStore.js';

function getAIKeyMutationError(error) {
  const message = error instanceof Error ? error.message : 'AI key settings could not be saved.';
  const isInvalidRequest = /already configured|already exists|maximum of \d+|choose an available key/i.test(message);
  return { status: isInvalidRequest ? 400 : 503, message };
}

function isAIProvider(value) {
  return value === 'gemini' || value === 'openai';
}

function isValidAIKey(value) {
  return typeof value === 'string'
    && value.trim().length >= 8
    && value.trim().length <= 500
    && !/\s/.test(value.trim());
}

function isValidAIKeyList(keys) {
  return Array.isArray(keys)
    && keys.length >= 1
    && keys.length <= 10
    && keys.every(isValidAIKey);
}

function uniqueCloudinaryAssets(assets) {
  const unique = new Map();
  for (const asset of assets) {
    if (asset) unique.set(`${asset.resourceType}:${asset.publicId}`, {
      publicId: asset.publicId,
      resourceType: asset.resourceType,
      secureUrl: asset.secureUrl || '',
    });
  }
  return [...unique.values()];
}

async function deleteCloudinaryAssets(assets) {
  const failed = [];
  for (const asset of assets) {
    try {
      await deleteCloudinaryAsset(asset);
    } catch {
      failed.push(asset);
    }
  }
  return failed;
}

function uploadedAsset(publicId, resourceType) {
  return publicId ? { publicId, resourceType, secureUrl: '' } : undefined;
}

function decodeBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return undefined;
  const data = Buffer.from(value, 'base64');
  return data.length ? data : undefined;
}

export const getAdminAIKeys = async (_req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'AI key storage is unavailable without MongoDB.' });
  try {
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin AI key settings load error:', error);
    return res.status(503).json({ error: 'AI key settings are temporarily unavailable.' });
  }
};

export const postAdminAIKeys = async (req, res) => {
  const { provider, keys } = req.body || {};
  if (!isAIProvider(provider) || !isValidAIKeyList(keys)) {
    return res.status(400).json({ error: 'Choose a provider and enter 1 to 10 valid API keys.' });
  }
  try {
    await addAdminAIKeys(provider, keys.map(key => key.trim()));
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin AI key save error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const patchAdminAIKeys = async (req, res) => {
  const { provider, useEnvironmentKeys, preferredKeyId } = req.body || {};
  if (!isAIProvider(provider)) {
    return res.status(400).json({ error: 'A valid AI provider is required.' });
  }
  try {
    if (typeof useEnvironmentKeys === 'boolean') {
      await setUseEnvironmentAIKeys(provider, useEnvironmentKeys);
    } else if (typeof preferredKeyId === 'string' && preferredKeyId.length <= 100) {
      await setPreferredAIKey(provider, preferredKeyId);
    } else {
      return res.status(400).json({ error: 'Choose a key or provide an environment-key setting.' });
    }
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin AI key preference update error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const patchAdminAIKey = async (req, res) => {
  const { provider } = req.params;
  const { key } = req.body || {};
  if (!isAIProvider(provider) || !isValidAIKey(key)) {
    return res.status(400).json({ error: 'Choose a provider and enter a valid replacement API key.' });
  }
  try {
    const updated = await replaceAdminAIKey(provider, req.params.id, key.trim());
    if (!updated) return res.status(404).json({ error: 'Admin-managed API key not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin AI key replacement error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const postAdminCustomAIProvider = async (req, res) => {
  const { name, keys, model, enabledForAI } = req.body || {};
  const providerName = typeof name === 'string' ? name.trim() : '';
  if (providerName.length < 2 || providerName.length > 60 || !isValidAIKeyList(keys)) {
    return res.status(400).json({ error: 'Enter a provider name (2 to 60 characters) and 1 to 10 valid API keys.' });
  }
  if (enabledForAI !== undefined && typeof enabledForAI !== 'boolean') {
    return res.status(400).json({ error: 'Choose whether to use this provider with the chatbot.' });
  }
  const useOpenRouter = enabledForAI === true;
  const modelId = typeof model === 'string' ? model.trim() : '';
  if (useOpenRouter && (!modelId || modelId.length > 120 || /\s/.test(modelId))) {
    return res.status(400).json({ error: 'Enter a valid OpenRouter model ID before enabling chatbot use.' });
  }
  if (['gemini', 'google gemini', 'openai'].includes(providerName.toLocaleLowerCase())) {
    return res.status(400).json({ error: 'Use the built-in provider settings for Gemini and OpenAI.' });
  }
  try {
    await addCustomAIProvider(providerName, keys.map(key => key.trim()), modelId, useOpenRouter);
    return res.status(201).json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider creation error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const patchAdminCustomAIProvider = async (req, res) => {
  const { name, model, enabledForAI } = req.body || {};
  const settings = {};
  if (name !== undefined) {
    const providerName = typeof name === 'string' ? name.trim() : '';
    if (providerName.length < 2 || providerName.length > 60) {
      return res.status(400).json({ error: 'Enter a provider name between 2 and 60 characters.' });
    }
    if (['gemini', 'google gemini', 'openai'].includes(providerName.toLocaleLowerCase())) {
      return res.status(400).json({ error: 'Use the built-in provider settings for Gemini and OpenAI.' });
    }
    settings.name = providerName;
  }
  if (model !== undefined) {
    if (typeof model !== 'string' || model.trim().length > 120 || /\s/.test(model.trim())) {
      return res.status(400).json({ error: 'Enter a valid OpenRouter model ID.' });
    }
    settings.model = model.trim();
  }
  if (enabledForAI !== undefined) {
    if (typeof enabledForAI !== 'boolean') {
      return res.status(400).json({ error: 'Choose whether to use this provider with the chatbot.' });
    }
    settings.enabledForAI = enabledForAI;
  }
  if (Object.keys(settings).length === 0) {
    return res.status(400).json({ error: 'Update the provider name, model, or chatbot setting.' });
  }
  try {
    const updated = await updateCustomAIProviderSettings(req.params.id, settings);
    if (!updated) return res.status(404).json({ error: 'Custom AI provider not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider update error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const patchAdminCustomAIProviderPreferredKey = async (req, res) => {
  const keyId = typeof req.body?.keyId === 'string' ? req.body.keyId : '';
  if (!keyId) return res.status(400).json({ error: 'Choose a key to prefer.' });
  try {
    const updated = await setPreferredCustomAIKey(req.params.providerId, keyId);
    if (!updated) return res.status(404).json({ error: 'Custom AI provider key not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider key preference error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const deleteAdminCustomAIProvider = async (req, res) => {
  try {
    const removed = await deleteCustomAIProvider(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Custom AI provider not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider deletion error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const postAdminCustomAIProviderKeys = async (req, res) => {
  const { keys } = req.body || {};
  if (!isValidAIKeyList(keys)) {
    return res.status(400).json({ error: 'Enter 1 to 10 valid API keys.' });
  }
  try {
    const updated = await addCustomAIProviderKeys(req.params.id, keys.map(key => key.trim()));
    if (!updated) return res.status(404).json({ error: 'Custom AI provider not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider key save error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const patchAdminCustomAIProviderKey = async (req, res) => {
  const { key } = req.body || {};
  if (!isValidAIKey(key)) return res.status(400).json({ error: 'Enter a valid replacement API key.' });
  try {
    const updated = await replaceCustomAIProviderKey(req.params.providerId, req.params.keyId, key.trim());
    if (!updated) return res.status(404).json({ error: 'Custom AI provider key not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider key replacement error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const deleteAdminCustomAIProviderKey = async (req, res) => {
  try {
    const removed = await deleteCustomAIProviderKey(req.params.providerId, req.params.keyId);
    if (!removed) return res.status(404).json({ error: 'Custom AI provider key not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin custom AI provider key deletion error:', error);
    const result = getAIKeyMutationError(error);
    return res.status(result.status).json({ error: result.message });
  }
};

export const deleteAdminAIKey = async (req, res) => {
  const { provider } = req.params;
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  if (!isAIProvider(provider) || !id) return res.status(400).json({ error: 'A valid provider and key ID are required.' });
  if (id.startsWith('env-')) return res.status(400).json({ error: 'Environment keys cannot be deleted here; disable environment keys instead.' });
  try {
    const removed = await removeAdminAIKey(provider, id);
    if (!removed) return res.status(404).json({ error: 'AI key not found.' });
    return res.json({ providers: await getAdminAIKeySettings() });
  } catch (error) {
    console.error('Admin AI key deletion error:', error);
    return res.status(503).json({ error: error instanceof Error ? error.message : 'AI key could not be deleted.' });
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const databaseUsers = isMongoConnected
      ? await UserModel.find({}, { password: 0, _id: 0 }).sort({ createdAt: -1 }).lean()
      : [];
    const usersByEmail = new Map();
    for (const user of databaseUsers) {
      usersByEmail.set(String(user.email).toLowerCase(), user);
    }
    for (const user of memoryUsers) {
      const email = user.email.toLowerCase();
      if (!usersByEmail.has(email)) usersByEmail.set(email, safeUser(user));
    }
    const users = Array.from(usersByEmail.values()).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    res.json({ users });
  } catch (error) {
    console.error('Admin user listing error:', error);
    res.status(500).json({ error: 'Unable to load users.' });
  }
};

export const patchAdminUsersById = async (req, res) => {
  const { role } = req.body;
  if (!['user', 'counselor', 'admin', 'super_admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid user role.' });
  }
  if (req.params.id === 'user_system_admin') {
    return res.status(400).json({ error: 'The system administrator role cannot be changed.' });
  }
  try {
    if (isMongoConnected) {
      const updated = await UserModel.findOneAndUpdate(
        { id: req.params.id },
        { $set: { role } },
        { returnDocument: 'after', projection: { password: 0, _id: 0 } }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'User not found.' });
      return res.json({ user: updated });
    }
    const user = memoryUsers.find(item => item.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.role = role;
    return res.json({ user: safeUser(user) });
  } catch (error) {
    console.error('Admin user update error:', error);
    return res.status(500).json({ error: 'Unable to update user.' });
  }
};

export const deleteAdminUsersById = async (req, res) => {
  if (req.params.id === 'user_system_admin') {
    return res.status(400).json({ error: 'The system administrator cannot be deleted.' });
  }
  try {
    if (isMongoConnected) {
      const deleted = await UserModel.findOneAndDelete({ id: req.params.id });
      if (!deleted) return res.status(404).json({ error: 'User not found.' });
    } else {
      const index = memoryUsers.findIndex(item => item.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'User not found.' });
      memoryUsers.splice(index, 1);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin user deletion error:', error);
    return res.status(500).json({ error: 'Unable to delete user.' });
  }
};

export const getAdminCrisisHelplines = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Crisis helpline storage is unavailable.' });
  try {
    return res.json({ helplines: await loadCrisisHelplines() });
  } catch (error) {
    console.error('Admin crisis helpline load error:', error);
    return res.status(503).json({ error: 'Crisis helplines are temporarily unavailable.' });
  }
};

export const putAdminCrisisHelplines = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Crisis helpline storage is unavailable.' });
  const helplines = parseCrisisHelplines(req.body?.helplines);
  if (!helplines) {
    return res.status(400).json({ error: 'Keep at least one helpline, add a name and valid phone number, and check the field limits.' });
  }

  try {
    const saved = await CrisisHelplineConfigModel.findOneAndUpdate(
      { id: 'crisis-helplines' },
      { $set: { helplines } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    if (!saved) throw new Error('Unable to save crisis helplines.');
    return res.json({ helplines: saved.helplines });
  } catch (error) {
    console.error('Admin crisis helpline storage error:', error);
    return res.status(503).json({ error: 'Crisis helplines could not be saved. Please try again later.' });
  }
};

export const getAdminDonationSettings = async (_req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Donation settings storage is unavailable.' });
  try {
    const settings = await loadDonationSettings();
    return res.json({
      bkashNumber: settings.bkashNumber,
      enabled: settings.enabled,
      changeHistory: settings.changeHistory || [],
    });
  } catch (error) {
    console.error('Admin donation settings load error:', error);
    return res.status(503).json({ error: 'Donation settings are temporarily unavailable.' });
  }
};

export const putAdminDonationSettings = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Donation settings storage is unavailable.' });

  const rawNumber = req.body?.bkashNumber;
  const compactNumber = typeof rawNumber === 'string' ? rawNumber.trim().replace(/[\s()-]/g, '') : '';
  const bkashNumber = compactNumber.startsWith('+880')
    ? `0${compactNumber.slice(4)}`
    : compactNumber.startsWith('880')
      ? `0${compactNumber.slice(3)}`
      : compactNumber;
  const enabled = req.body?.enabled;
  if (!/^01[3-9]\d{8}$/.test(bkashNumber) || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Enter a valid Bangladesh bKash number and choose whether the donation button is enabled.' });
  }

  try {
    const identity = getAdminIdentity(req);
    if (!identity) return res.status(403).json({ error: 'Admin identity is unavailable for audit logging.' });
    const admin = await UserModel.findOne(
      { id: identity.userId, role: { $in: ['admin', 'super_admin'] } },
      { id: 1, name: 1, email: 1, _id: 0 },
    ).lean();
    if (!admin) return res.status(403).json({ error: 'Admin account could not be found for audit logging.' });

    const current = await loadDonationSettings();
    if (current.bkashNumber === bkashNumber && current.enabled === enabled) {
      return res.json({
        bkashNumber: current.bkashNumber,
        enabled: current.enabled,
        changeHistory: current.changeHistory || [],
      });
    }

    const changedAt = new Date();
    const saved = await DonationSettingsModel.findOneAndUpdate(
      { id: 'donations', bkashNumber: current.bkashNumber, enabled: current.enabled },
      {
        $set: { bkashNumber, enabled },
        $push: {
          changeHistory: {
            adminId: admin.id,
            adminName: admin.name,
            adminEmail: admin.email,
            previousBkashNumber: current.bkashNumber,
            bkashNumber,
            previousEnabled: current.enabled,
            enabled,
            changedAt,
          },
        },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!saved) {
      return res.status(409).json({ error: 'Donation settings changed in another admin session. Reload them and try again.' });
    }
    return res.json({
      bkashNumber: saved.bkashNumber,
      enabled: saved.enabled,
      changeHistory: saved.changeHistory || [],
    });
  } catch (error) {
    console.error('Admin donation settings save error:', error);
    return res.status(503).json({ error: 'Donation settings could not be saved. Please try again later.' });
  }
};

export const getAdminAboutTeam = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'About profile storage is unavailable.' });
  try {
    const memberIds = await getAboutTeamMemberIds();
    const profiles = await AboutTeamMemberModel.find({ id: { $in: memberIds } }, { imageData: 0, cvData: 0, _id: 0, __v: 0 })
      .lean();
    const profilesById = new Map(profiles.map(member => [member.id, member]));
    return res.json({ members: memberIds.map(id => getPublicAboutTeamMember(profilesById.get(id) || { id })) });
  } catch (error) {
    console.error('Admin about team load error:', error);
    return res.status(503).json({ error: 'About profiles are temporarily unavailable.' });
  }
};

export const putAdminAboutTeam = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'About profile storage is unavailable.' });

  const body = req.body || {};
  const id = typeof body.id === 'string' ? body.id : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
  const position = typeof body.position === 'string' ? body.position.trim().slice(0, 100) : '';
  const university = typeof body.university === 'string' ? body.university.trim().slice(0, 120) : '';
  const imageContentType = typeof body.imageContentType === 'string' ? body.imageContentType.toLowerCase() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const cvContentType = typeof body.cvContentType === 'string' ? body.cvContentType.toLowerCase() : '';
  const cvFileName = typeof body.cvFileName === 'string' ? body.cvFileName.trim().slice(0, 100) : '';
  const cvBase64 = typeof body.cvBase64 === 'string' ? body.cvBase64 : '';
  const socialLinks = normalizeSocialLinks(body.socialLinks);

  if (!id) return res.status(400).json({ error: 'A valid team member ID is required.' });
  if (!socialLinks) return res.status(400).json({ error: 'Enter valid social profile links using http or https.' });
  const imageData = imageBase64 ? decodeBase64(imageBase64) : undefined;
  const cvData = cvBase64 ? decodeBase64(cvBase64) : undefined;
  const imageSignatures = {
    'image/jpeg': data => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
    'image/png': data => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': data => data.subarray(0, 4).toString('ascii') === 'RIFF'
      && data.subarray(8, 12).toString('ascii') === 'WEBP',
  };
  if (imageBase64 || imageContentType) {
    if (!imageData || !imageSignatures[imageContentType]?.(imageData)) {
      return res.status(400).json({ error: 'Choose a valid JPG, PNG, or WebP image.' });
    }
    if (imageData.length > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Profile images must be 2 MB or smaller.' });
    }
  }
  if (cvBase64 || cvContentType || cvFileName) {
    if (cvContentType !== 'application/pdf' || !cvData || !cvFileName.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Choose a valid PDF file.' });
    }
    if (cvData.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'CV files must be 10 MB or smaller.' });
    }
    if (cvData.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(400).json({ error: 'The selected file is not a valid PDF.' });
    }
  }

  const uploadedAssets = [];
  let profileSaved = false;
  try {
    const memberIds = await getAboutTeamMemberIds();
    if (!memberIds.includes(id)) return res.status(404).json({ error: 'Team card not found.' });
    const previous = await AboutTeamMemberModel.findOne({ id }).lean();
    let imageAsset;
    let cvAsset;
    if (imageData) {
      imageAsset = await uploadCloudinaryAsset(imageData, {
        folder: 'mindcare/about-team',
        publicId: `${id}/image-${randomUUID()}`,
        resourceType: 'image',
      });
      uploadedAssets.push(imageAsset);
    }
    if (cvData) {
      const safeFileName = cvFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      cvAsset = await uploadCloudinaryAsset(cvData, {
        folder: 'mindcare/about-team',
        publicId: `${id}/cv-${randomUUID()}-${safeFileName}`,
        resourceType: 'raw',
      });
      uploadedAssets.push(cvAsset);
    }
    const cleanupAssets = uniqueCloudinaryAssets([
      ...(previous?.pendingCloudinaryDeletions || []),
      imageAsset ? uploadedAsset(previous?.imageCloudinaryId, 'image') : undefined,
      cvAsset ? uploadedAsset(previous?.cvCloudinaryId, 'raw') : undefined,
    ]);
    const update = {
      name,
      phone,
      position,
      university,
      socialLinks,
      updatedAt: new Date(),
      pendingCloudinaryDeletions: cleanupAssets,
      ...(imageAsset ? {
        imageCloudinaryId: imageAsset.publicId,
        imageUrl: imageAsset.secureUrl,
        imageContentType,
      } : {}),
      ...(cvAsset ? {
        cvCloudinaryId: cvAsset.publicId,
        cvUrl: cvAsset.secureUrl,
        cvFileName: cvFileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
        cvContentType: 'application/pdf',
      } : {}),
    };
    const unset = {
      ...(imageAsset ? { imageData: 1 } : {}),
      ...(cvAsset ? { cvData: 1 } : {}),
    };
    const saved = await AboutTeamMemberModel.findOneAndUpdate(
      { id },
      { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    if (!saved) throw new Error('Unable to save the team profile.');
    profileSaved = true;
    const failedDeletes = await deleteCloudinaryAssets(cleanupAssets);
    await AboutTeamMemberModel.updateOne({ id }, {
      $set: { pendingCloudinaryDeletions: failedDeletes },
    });
    if (failedDeletes.length) {
      console.error('About team Cloudinary cleanup failed for one or more previous files.');
      return res.status(503).json({ error: 'The profile was saved, but an old Cloudinary file could not be removed. Retry saving this profile.' });
    }
    return res.json({ member: getPublicAboutTeamMember(saved) });
  } catch (error) {
    if (!profileSaved) {
      const failedDeletes = await deleteCloudinaryAssets(uploadedAssets);
      if (failedDeletes.length) console.error('Cloudinary cleanup failed after an About profile save error.');
    }
    console.error('About team profile save error:', error);
    return res.status(503).json({ error: 'The profile could not be saved. Please try again later.' });
  }
};

export const postAdminAboutTeam = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'About profile storage is unavailable.' });
  try {
    await getAboutTeamMemberIds();
    const id = `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const config = await AboutTeamConfigModel.findOneAndUpdate(
      { id: 'about-team' },
      { $push: { memberIds: id } },
      { returnDocument: 'after' },
    );
    if (!config) throw new Error('Unable to add a team card.');
    return res.status(201).json({ member: getPublicAboutTeamMember({ id }) });
  } catch (error) {
    console.error('Admin about team card creation error:', error);
    return res.status(503).json({ error: 'A team card could not be added.' });
  }
};

export const deleteAdminAboutTeam = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'About profile storage is unavailable.' });
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!id) return res.status(400).json({ error: 'A team card ID is required.' });
  try {
    const [config, member] = await Promise.all([
      AboutTeamConfigModel.findOne({ id: 'about-team' }).lean(),
      AboutTeamMemberModel.findOne({ id }).lean(),
    ]);
    if (!config?.memberIds.includes(id)) return res.status(404).json({ error: 'Team card not found.' });
    const assets = uniqueCloudinaryAssets([
      ...(member?.pendingCloudinaryDeletions || []),
      uploadedAsset(member?.imageCloudinaryId, 'image'),
      uploadedAsset(member?.cvCloudinaryId, 'raw'),
    ]);
    if ((await deleteCloudinaryAssets(assets)).length) {
      return res.status(503).json({ error: 'The team card was not deleted because a Cloudinary file could not be removed.' });
    }
    await AboutTeamMemberModel.deleteOne({ id });
    await AboutTeamConfigModel.updateOne({ id: 'about-team' }, { $pull: { memberIds: id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin about team card deletion error:', error);
    return res.status(503).json({ error: 'The team card could not be deleted.' });
  }
};

export const getAdminSoundscapes = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Sound library storage is unavailable.' });
  try {
    const saved = await SoundscapeModel.find({}, { audioData: 0, _id: 0, __v: 0 })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ soundscapes: saved.map(getPublicSoundscape) });
  } catch (error) {
    console.error('Admin soundscape load error:', error);
    return res.status(503).json({ error: 'Sound library is temporarily unavailable.' });
  }
};

export const postAdminSoundscapes = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Sound library storage is unavailable.' });

  const { titleEn = '', titleBn = '', fileName = '', contentType = '', audioBase64 = '' } = req.body || {};
  if (typeof titleEn !== 'string' || typeof titleBn !== 'string'
    || typeof fileName !== 'string' || typeof contentType !== 'string'
    || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'Invalid soundscape details.' });
  }
  if ((!titleEn.trim() && !titleBn.trim()) || !fileName.trim() || !contentType.toLowerCase().startsWith('audio/')) {
    return res.status(400).json({ error: 'Add a title and select a valid audio file.' });
  }
  const audioData = decodeBase64(audioBase64);
  if (!audioData) {
    return res.status(400).json({ error: 'The uploaded audio file is invalid.' });
  }
  if (!audioData.length || audioData.length > 3 * 1024 * 1024) {
    return res.status(413).json({ error: 'Audio files must be 3 MB or smaller.' });
  }
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (!['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'webm'].includes(extension)) {
    return res.status(400).json({ error: 'Choose a supported audio file.' });
  }

  let uploaded;
  let soundscapeSaved = false;
  try {
    const titleEnValue = titleEn.trim().slice(0, 100);
    const titleBnValue = titleBn.trim().slice(0, 100);
    uploaded = await uploadCloudinaryAsset(audioData, {
      folder: 'mindcare/soundscapes',
      publicId: `sound-${randomUUID()}`,
      resourceType: 'video',
      format: extension,
    });
    const saved = await SoundscapeModel.create({
      id: `ambient_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      titleEn: titleEnValue || titleBnValue,
      titleBn: titleBnValue || titleEnValue,
      audioFileName: fileName.trim().slice(0, 120).replace(/[^\p{L}\p{N}._ -]/gu, '_'),
      contentType: contentType.trim().toLowerCase(),
      audioCloudinaryId: uploaded.publicId,
      audioUrl: uploaded.secureUrl,
    });
    soundscapeSaved = true;
    return res.status(201).json({ soundscape: getPublicSoundscape(saved) });
  } catch (error) {
    if (uploaded && !soundscapeSaved) {
      const failedDeletes = await deleteCloudinaryAssets([uploaded]);
      if (failedDeletes.length) console.error('Cloudinary cleanup failed after soundscape creation failed.');
    }
    console.error('Ambient soundscape save error:', error);
    return res.status(503).json({ error: 'Soundscape could not be saved. Please try again later.' });
  }
};

export const patchAdminSoundscapes = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Sound library storage is unavailable.' });

  const { id = '', titleEn = '', titleBn = '', fileName = '', contentType = '', audioBase64 = '' } = req.body || {};
  if (typeof id !== 'string' || !id.trim() || id.length > 120) {
    return res.status(400).json({ error: 'A valid soundscape ID is required.' });
  }
  if (typeof titleEn !== 'string' || typeof titleBn !== 'string'
    || typeof fileName !== 'string' || typeof contentType !== 'string'
    || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'Invalid soundscape details.' });
  }

  const titleEnValue = titleEn.trim().slice(0, 100);
  const titleBnValue = titleBn.trim().slice(0, 100);
  if (!titleEnValue && !titleBnValue) {
    return res.status(400).json({ error: 'Add a title in at least one language.' });
  }

  const hasAudioUpdate = Boolean(fileName || contentType || audioBase64);
  let audioData;
  let extension = '';
  if (hasAudioUpdate) {
    audioData = decodeBase64(audioBase64);
    extension = fileName.split('.').pop()?.toLowerCase() || '';
    if (!fileName.trim() || !contentType.toLowerCase().startsWith('audio/') || !audioData
      || !['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'webm'].includes(extension)) {
      return res.status(400).json({ error: 'Choose a valid audio file to replace the built-in sound.' });
    }
    if (!audioData.length || audioData.length > 3 * 1024 * 1024) {
      return res.status(413).json({ error: 'Audio files must be 3 MB or smaller.' });
    }
  }

  let uploaded;
  let soundscapeSaved = false;
  try {
    const previous = await SoundscapeModel.findOne({ id }).lean();
    const isBuiltIn = Boolean(BUILT_IN_SOUND_TYPES[id]);
    if (!previous && !isBuiltIn) return res.status(404).json({ error: 'Soundscape not found.' });
    if (audioData) {
      uploaded = await uploadCloudinaryAsset(audioData, {
        folder: 'mindcare/soundscapes',
        publicId: `sound-${randomUUID()}`,
        resourceType: 'video',
        format: extension,
      });
    }
    const cleanupAssets = uniqueCloudinaryAssets([
      ...(previous?.pendingCloudinaryDeletions || []),
      uploaded ? uploadedAsset(previous?.audioCloudinaryId, 'video') : undefined,
    ]);
    const update = {
      titleEn: titleEnValue || titleBnValue,
      titleBn: titleBnValue || titleEnValue,
      pendingCloudinaryDeletions: cleanupAssets,
      ...(isBuiltIn ? { soundType: BUILT_IN_SOUND_TYPES[id] } : {}),
      ...(uploaded ? {
        audioFileName: fileName.trim().slice(0, 120).replace(/[^\p{L}\p{N}._ -]/gu, '_'),
        contentType: contentType.trim().toLowerCase(),
        audioCloudinaryId: uploaded.publicId,
        audioUrl: uploaded.secureUrl,
      } : {}),
    };
    const saved = await SoundscapeModel.findOneAndUpdate(
      { id },
      {
        $set: update,
        ...(uploaded ? { $unset: { audioData: 1 } } : {}),
      },
      { upsert: isBuiltIn, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    if (!saved) throw new Error('Unable to save the soundscape.');
    soundscapeSaved = true;
    const failedDeletes = await deleteCloudinaryAssets(cleanupAssets);
    await SoundscapeModel.updateOne({ id }, {
      $set: { pendingCloudinaryDeletions: failedDeletes },
    });
    if (failedDeletes.length) {
      console.error('Soundscape Cloudinary cleanup failed for one or more previous files.');
      return res.status(503).json({ error: 'The soundscape was saved, but an old Cloudinary file could not be removed. Retry saving this soundscape.' });
    }
    return res.json({ soundscape: getPublicSoundscape(saved) });
  } catch (error) {
    if (!soundscapeSaved && uploaded) {
      const failedDeletes = await deleteCloudinaryAssets([uploaded]);
      if (failedDeletes.length) console.error('Cloudinary cleanup failed after soundscape update failed.');
    }
    console.error('Ambient soundscape update error:', error);
    return res.status(503).json({ error: 'Soundscape could not be updated. Please try again later.' });
  }
};

export const deleteAdminSoundscapes = async (req, res) => {
  if (!isMongoConnected) return res.status(503).json({ error: 'Sound library storage is unavailable.' });
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!id) return res.status(400).json({ error: 'Soundscape ID is required.' });
  try {
    const soundscape = await SoundscapeModel.findOne({ id }).lean();
    if (!soundscape) return res.status(404).json({ error: 'Soundscape not found.' });
    const assets = uniqueCloudinaryAssets([
      ...(soundscape.pendingCloudinaryDeletions || []),
      uploadedAsset(soundscape.audioCloudinaryId, 'video'),
    ]);
    if ((await deleteCloudinaryAssets(assets)).length) {
      return res.status(503).json({ error: 'The soundscape was not deleted because its Cloudinary audio could not be removed.' });
    }
    await SoundscapeModel.deleteOne({ id });
    return res.json({ success: true });
  } catch (error) {
    console.error('Ambient soundscape deletion error:', error);
    return res.status(503).json({ error: 'Soundscape could not be removed.' });
  }
};