
import {
  AboutTeamMemberModel,
  CrisisHelplineConfigModel,
  DEFAULT_DONATION_SETTINGS,
  SoundscapeModel,
  getAboutTeamMemberIds,
  isMongoConnected,
  loadCrisisHelplines,
  loadDonationSettings
} from '../models/database.js';

import { isAIAvailable } from '../ai/service.js';
import {
  getPublicAboutTeamMember,
  getPublicSoundscape
} from '../services/presenters.js';
import { getCloudinaryDownloadUrl } from '../services/cloudinaryStorage.js';

export const getHealth = async (_req, res) => {
  res.json({
    status: 'ok',
    service: 'MindCare API',
    mongoStatus: isMongoConnected ? 'connected' : 'memory_fallback',
    aiAvailable: await isAIAvailable(),
    timestamp: new Date().toISOString()
  });
};

export const getDbStatus = (req, res) => {
  res.json({
    connected: isMongoConnected,
    mode: isMongoConnected ? 'MongoDB Atlas' : 'In-Memory Secure Store',
    uriMasked: 'mongodb+srv://sudiptobordhon_db_user:sudip123@cluster0.e1g0f6w.mongodb.net'
  });
};

export const getAboutTeam = async (_req, res) => {
  console.log('Loading about team members...');

  if (!isMongoConnected) {
    return res.status(503).json({ error: 'About profiles are unavailable.' });
  }

  try {
    const memberIds = await getAboutTeamMemberIds();

    console.log('Found team member IDs:', memberIds);

    const profiles = await AboutTeamMemberModel.find(
      { id: { $in: memberIds } },
      { imageData: 0, cvData: 0, _id: 0, __v: 0 }
    ).lean();

    console.log('Loaded team member profiles:', profiles);

    const profilesById = new Map(
      profiles.map(member => [member.id, member])
    );

    console.log('Loaded team member profiles:', profilesById);

    return res.json({
      members: memberIds.map(id =>
        getPublicAboutTeamMember(profilesById.get(id) || { id })
      )
    });
  } catch (error) {
    console.error('About team load error:', error);

    return res.status(503).json({
      error: 'About profiles are temporarily unavailable.'
    });
  }
};

export const getCrisisHelplines = async (_req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({
      error: 'Crisis helpline storage is unavailable.'
    });
  }

  try {
    return res.json({
      helplines: await loadCrisisHelplines()
    });
  } catch (error) {
    console.error('Crisis helpline load error:', error);

    return res.status(503).json({
      error: 'Crisis helplines are temporarily unavailable.'
    });
  }
};

export const getDonationSettings = async (_req, res) => {
  if (!isMongoConnected) {
    return res.json(DEFAULT_DONATION_SETTINGS);
  }

  try {
    const settings = await loadDonationSettings();

    return res.json({
      bkashNumber: settings.bkashNumber,
      enabled: settings.enabled
    });
  } catch (error) {
    console.error('Public donation settings load error:', error);

    return res.status(503).json({
      error: 'Donation settings are temporarily unavailable.'
    });
  }
};

export const getAboutTeamImage = async (req, res) => {
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (!id) {
    return res.status(400).json({
      error: 'A valid team member ID is required.'
    });
  }

  if (!isMongoConnected) {
    return res.status(503).json({
      error: 'About profile storage is unavailable.'
    });
  }

  try {
    const memberIds = await getAboutTeamMemberIds();

    if (!memberIds.includes(id)) {
      return res.status(404).json({
        error: 'Team card not found.'
      });
    }

    const member = await AboutTeamMemberModel.findOne({ id })
      .select('+imageData')
      .lean();

    if (!member?.imageData || !member.imageContentType) {
      return res.status(404).json({
        error: 'Profile image not found.'
      });
    }

    res.setHeader('Content-Type', member.imageContentType);
    res.setHeader('Content-Length', member.imageData.length);
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.send(member.imageData);
  } catch (error) {
    console.error('About team image delivery error:', error);

    return res.status(503).json({
      error: 'Profile image is temporarily unavailable.'
    });
  }
};

export const getAboutTeamCv = async (req, res) => {
  const id = typeof req.query.id === 'string' ? req.query.id : '';

  if (!id) {
    return res.status(400).json({
      error: 'A valid team member ID is required.'
    });
  }

  if (!isMongoConnected) {
    return res.status(503).json({
      error: 'About profile storage is unavailable.'
    });
  }

  try {
    const memberIds = await getAboutTeamMemberIds();

    if (!memberIds.includes(id)) {
      return res.status(404).json({
        error: 'Team card not found.'
      });
    }

    const member = await AboutTeamMemberModel.findOne({ id })
      .select('+cvData')
      .lean();

    if (
      member?.cvCloudinaryId &&
      member.cvContentType === 'application/pdf' &&
      member.cvFileName
    ) {
      const url = getCloudinaryDownloadUrl(
        { publicId: member.cvCloudinaryId, resourceType: 'raw' },
        'pdf'
      );

      res.setHeader('Cache-Control', 'no-store');

      return res.redirect(302, url);
    }

    if (
      !member?.cvData ||
      member.cvContentType !== 'application/pdf' ||
      !member.cvFileName
    ) {
      return res.status(404).json({
        error: 'CV file not found.'
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', member.cvData.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${member.cvFileName}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.send(member.cvData);
  } catch (error) {
    console.error('About team CV delivery error:', error);

    return res.status(503).json({
      error: 'CV file is temporarily unavailable.'
    });
  }
};

export const getSoundscapes = async (_req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({
      error: 'Sound library storage is unavailable.'
    });
  }

  try {
    const saved = await SoundscapeModel.find(
      {},
      { audioData: 0, _id: 0, __v: 0 }
    )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      soundscapes: saved.map(getPublicSoundscape)
    });
  } catch (error) {
    console.error('Ambient soundscape load error:', error);

    return res.status(503).json({
      error: 'Sound library is temporarily unavailable.'
    });
  }
};

export const getSoundscapesByIdAudio = async (req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({
      error: 'Audio storage is unavailable.'
    });
  }

  try {
    const soundscape = await SoundscapeModel.findOne({
      id: req.params.id
    })
      .select('+audioData')
      .lean();

    if (!soundscape?.audioData || !soundscape.contentType) {
      return res.status(404).json({
        error: 'Audio file not found.'
      });
    }

    res.setHeader('Content-Type', soundscape.contentType);
    res.setHeader('Content-Length', soundscape.audioData.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.send(soundscape.audioData);
  } catch (error) {
    console.error('Ambient audio delivery error:', error);

    return res.status(503).json({
      error: 'Audio is temporarily unavailable.'
    });
  }
};
