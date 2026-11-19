export const SOCIAL_LINK_PLATFORMS = [
  'facebook',
  'linkedin',
  'instagram',
  'twitter',
];

export function normalizeSocialLink(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return '';
  if (trimmed.length > 500) return null;

  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeSocialLinks(value) {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'object' || Array.isArray(value))
  ) {
    return null;
  }

  const links = value && typeof value === 'object' ? value : {};

  const normalized = {
    facebook: '',
    linkedin: '',
    instagram: '',
    twitter: '',
  };

  for (const platform of SOCIAL_LINK_PLATFORMS) {
    const link =
      links[platform] === undefined
        ? ''
        : normalizeSocialLink(links[platform]);

    if (link === null) return null;

    normalized[platform] = link;
  }

  return normalized;
}