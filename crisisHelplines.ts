export interface CrisisHelpline {
  id: string;
  nameEn: string;
  nameBn: string;
  descriptionEn: string;
  descriptionBn: string;
  phone: string;
}

export const INITIAL_CRISIS_HELPLINES: CrisisHelpline[] = [
  {
    id: 'hl_16122',
    nameEn: 'National Mental Health Helpline (16122)',
    nameBn: 'জাতীয় মানসিক স্বাস্থ্য হেল্পলাইন (১৬১২২)',
    descriptionEn: 'Govt. Toll-Free 24/7 Professional Counseling • NIMH',
    descriptionBn: 'সরকারি বিনামূল্যে ২৪ ঘণ্টা সেবা • NIMH & স্বাস্থ্য অধিদপ্তর',
    phone: '16122',
  },
  {
    id: 'hl_kaan_pete_roi',
    nameEn: 'Kaan Pete Roi (Emotional Support Helpline)',
    nameBn: 'কান পেতে রই (ইমোশনাল সাপোর্ট)',
    descriptionEn: 'Confidential active listening & emotional relief',
    descriptionBn: 'সহানুভূতিশীল গোপন শ্রবণ সেবা • ০১৭৭৯৫৫৪৩৯১',
    phone: '+880 1779 554391',
  },
  {
    id: 'hl_999',
    nameEn: 'National Emergency Service (999)',
    nameBn: 'জাতীয় জরুরি সেবা (৯৯৯)',
    descriptionEn: 'Immediate emergency dispatch & ambulance',
    descriptionBn: 'অ্যাম্বুলেন্স ও পুলিশ জরুরি সেবা',
    phone: '999',
  },
];

export function parseCrisisHelplines(value: unknown): CrisisHelpline[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null;

  const helplines: CrisisHelpline[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const nameEn = typeof record.nameEn === 'string' ? record.nameEn.trim() : '';
    const nameBn = typeof record.nameBn === 'string' ? record.nameBn.trim() : '';
    const descriptionEn = typeof record.descriptionEn === 'string' ? record.descriptionEn.trim() : '';
    const descriptionBn = typeof record.descriptionBn === 'string' ? record.descriptionBn.trim() : '';
    const phone = typeof record.phone === 'string' ? record.phone.trim() : '';
    const phoneDigitCount = phone.replace(/\D/g, '').length;

    if (!/^[\w-]{1,80}$/.test(id) || ids.has(id)
      || (!nameEn && !nameBn) || nameEn.length > 120 || nameBn.length > 120
      || descriptionEn.length > 240 || descriptionBn.length > 240
      || !/^\+?[\d\s()-]{3,30}$/.test(phone) || phoneDigitCount < 3) return null;
    ids.add(id);
    helplines.push({ id, nameEn, nameBn, descriptionEn, descriptionBn, phone });
  }
  return helplines;
}
