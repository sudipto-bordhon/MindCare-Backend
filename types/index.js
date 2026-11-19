// Language: 'en' | 'bn'
// Theme: 'light' | 'dark'
// AgeBand: 'child_teen' | 'young_adult' | 'adult' | 'senior'
// Role: 'user' | 'counselor' | 'admin' | 'super_admin'

// User
// id, name, email, ageBand, preferredLanguage, theme, role,
// createdAt, streakDays
// Optional: phone, adminToken

// ConsentSettings
// aiMemoryConsent, journalAnalysisConsent, analyticsConsent, lastUpdated

// CheckIn
// id, userId, date, mood, moodLabel, sleepHours, sleepQuality,
// stressLevel, energyLevel, focusLevel, tags
// Optional: createdAt, updatedAt, optionalNote

// ScreeningQuestion
// id, textEn, textBn

// ScreeningInstrument
// id, code, titleEn, titleBn, descriptionEn, descriptionBn,
// disclaimerEn, disclaimerBn, isStandardized, licenseInfo,
// questions, optionsEn, optionsBn, scoringBands

// ScreeningAttempt
// id, userId, instrumentId, instrumentTitle, date, answers,
// totalScore, maxScore, band, bandColor, recommendation
// Optional: flaggedSafetyQuestion, isManualRefresh, cycleAnchorDate

// JournalEntry
// id, userId, title, content, date, moodTag, category,
// createdAt, updatedAt
// Optional: aiReflection, revisions

// JournalEntryRevision
// title, content, date, moodTag, category, savedAt
// Optional: aiReflection

// ChatMessage
// id, role, content, timestamp
// Optional: isCrisis, source

// WellnessActivity
// id, titleEn, titleBn, category, durationMinutes,
// descriptionEn, descriptionBn, instructionsEn, instructionsBn
// Optional: audioSupported

// AmbientSoundscape
// id, titleEn, titleBn, source
// Optional: soundType, audioUrl, audioFileName

// AboutTeamMember
// id, name, phone, position, university, imageUrl, cvUrl,
// socialLinks

// CrisisHelpline
// id, nameEn, nameBn, descriptionEn, descriptionBn, phone

// MentalWellnessKnowledge
// id, titleEn, titleBn, contentEn, contentBn, category, createdAt

// ProfessionalContact
// id, nameEn, nameBn, titleEn, titleBn, organization,
// qualification, specialtyEn, specialtyBn, locationEn,
// locationBn, phone, isEmergencyHelpline, verified, verifiedDate
// Optional: email, tollFree

// AuditEvent
// id, actor, action, resourceType, timestamp, outcome, details

// Article
// id, titleEn, titleBn, categoryEn, categoryBn,
// readTimeMinutes, summaryEn, summaryBn, contentEn,
// contentBn, publishedDate, author