import type { AboutTeamMemberRecord, AmbientSoundscapeRecord, AppUser } from '../models/database';

export function safeUser(user: AppUser | Record<string, unknown>) {
  const { password: _password, ...withoutPassword } = user as AppUser;
  return withoutPassword;
}

export function getPublicSoundscape(soundscape: {
  id: string;
  titleEn: string;
  titleBn: string;
  audioFileName?: string;
  audioUrl?: string;
  soundType?: AmbientSoundscapeRecord['soundType'];
}) {
  const hasUploadedAudio = Boolean(soundscape.audioFileName);
  return {
    id: soundscape.id,
    titleEn: soundscape.titleEn,
    titleBn: soundscape.titleBn,
    source: hasUploadedAudio ? 'audio' as const : 'synth' as const,
    ...(soundscape.soundType ? { soundType: soundscape.soundType } : {}),
    ...(hasUploadedAudio ? {
      audioFileName: soundscape.audioFileName,
      audioUrl: soundscape.audioUrl || `/api/soundscapes/${encodeURIComponent(soundscape.id)}/audio`,
    } : {}),
  };
}

export function getPublicAboutTeamMember(member: Partial<AboutTeamMemberRecord> & { id: string }) {
  return {
    id: member.id,
    name: member.name || '',
    phone: member.phone || '',
    position: member.position || '',
    university: member.university || '',
    socialLinks: member.socialLinks || { facebook: '', linkedin: '', instagram: '', twitter: '' },
    imageUrl: member.imageUrl || (member.imageContentType && member.updatedAt
      ? `/api/about/team-image?id=${encodeURIComponent(member.id)}&v=${member.updatedAt.getTime()}`
      : ''),
    cvUrl: member.cvCloudinaryId
      ? `/api/about/team-cv?id=${encodeURIComponent(member.id)}&v=${member.updatedAt?.getTime() || 0}`
      : member.cvUrl || (member.cvFileName && member.updatedAt
        ? `/api/about/team-cv?id=${encodeURIComponent(member.id)}&v=${member.updatedAt.getTime()}`
        : ''),
  };
}
