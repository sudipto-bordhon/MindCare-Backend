export function safeUser(user) {
  const { password: _password, ...withoutPassword } = user;
  return withoutPassword;
}

export function getPublicSoundscape(soundscape) {
  const hasUploadedAudio = Boolean(soundscape.audioFileName);

  return {
    id: soundscape.id,
    titleEn: soundscape.titleEn,
    titleBn: soundscape.titleBn,
    source: hasUploadedAudio ? 'audio' : 'synth',
    ...(soundscape.soundType ? { soundType: soundscape.soundType } : {}),
    ...(hasUploadedAudio
      ? {
          audioFileName: soundscape.audioFileName,
          audioUrl:
            soundscape.audioUrl ||
            `/api/soundscapes/${encodeURIComponent(soundscape.id)}/audio`,
        }
      : {}),
  };
}

export function getPublicAboutTeamMember(member) {
  return {
    id: member.id,
    name: member.name || '',
    phone: member.phone || '',
    position: member.position || '',
    university: member.university || '',
    socialLinks: member.socialLinks || {
      facebook: '',
      linkedin: '',
      instagram: '',
      twitter: '',
    },
    imageUrl:
      member.imageUrl ||
      (member.imageContentType && member.updatedAt
        ? `/api/about/team-image?id=${encodeURIComponent(member.id)}&v=${member.updatedAt.getTime()}`
        : ''),
    cvUrl: member.cvCloudinaryId
      ? `/api/about/team-cv?id=${encodeURIComponent(member.id)}&v=${member.updatedAt?.getTime() || 0}`
      : member.cvUrl ||
        (member.cvFileName && member.updatedAt
          ? `/api/about/team-cv?id=${encodeURIComponent(member.id)}&v=${member.updatedAt.getTime()}`
          : ''),
  };
}