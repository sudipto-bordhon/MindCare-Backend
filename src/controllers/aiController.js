
import {
  buildLocalGuidance,
  checkCrisis,
  containsProfanity,
  isWellnessRelated,
  requestAICompletion
} from '../ai/service.js';

export const postChat = async (req, res) => {
  try {
    const { message, history = [], language = 'en', memoryConsent = true } = req.body;
    const requestedAgeBand = req.body?.ageBand;

    const ageBand = typeof requestedAgeBand === 'string'
      && ['child_teen', 'young_adult', 'adult', 'senior'].includes(requestedAgeBand)
      ? requestedAgeBand
      : 'adult';

    const isMinor = ageBand === 'child_teen';

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const isCrisis = checkCrisis(message);

    if (isCrisis) {
      const crisisReply = language === 'bn'
        ? `আমি শুনতে পাচ্ছি যে আপনি খুব কঠিন সময়ের মধ্য দিয়ে যাচ্ছেন, এবং আপনার এই কষ্ট অত্যন্ত গুরুত্বপূর্ণ। অনুগ্রহ করে একা থাকবেন না—সাহায্য নেওয়ার জন্য মানুষ প্রস্তুত আছেন।

🚨 **জরুরি সহায়তা ও হটলাইন (বাংলাদেশ):**
- **জাতীয় মানসিক স্বাস্থ্য হেল্পলাইন:** ১৬১২২ (বিনামূল্যে)
- **কান পেতে রই (ইমোশনাল সাপোর্ট):** ০১৭৭৯৫৫৪৩৯১
- **জরুরি জাতীয় সেবা:** ৯৯৯
- **আন্তর্জাতিক:** Crisis Text Line (HOME লিখে 741741 এ এসএমএস করুন) অথবা 988

অনুগ্রহ করে এখনই কোনো বিশ্বস্ত পরিবার/বন্ধুর সাথে যোগাযোগ করুন অথবা নিকটস্থ হাসপাতালে যান। আপনার জীবন মূল্যবান.${isMinor ? '\n\nআপনি ১৮ বছরের কম হলে, এখনই একজন নিরাপদ ও বিশ্বস্ত প্রাপ্তবয়স্ক—যেমন অভিভাবক, শিক্ষক বা কাউন্সেলর—কে জানান।' : ''}`
        : `I hear how much pain and distress you are experiencing right now, and your safety is deeply important. Please do not carry this alone—there are compassionate people ready to support you right now.

🚨 **Immediate Crisis & Emergency Helplines:**
- **Bangladesh National Mental Health Helpline:** 16122 (Toll-free)
- **Kaan Pete Roi (Emotional Support Helpline):** +8801779554391
- **National Emergency Assistance:** 999
- **International Suicide & Crisis Lifeline:** 988 (USA/Canada) or text HOME to 741741

Please reach out to a trusted loved one or contact emergency services immediately. You matter, and support is available.${isMinor ? '\n\nIf you are under 18, please tell a safe, trusted adult now, such as a parent or guardian, teacher, or counselor.' : ''}`;

      return res.json({
        reply: crisisReply,
        isCrisis: true,
        source: 'crisis_protocol',
      });
    }

    if (containsProfanity(message)) {
      const friendlyReply = language === 'bn'
        ? 'আরে ভাই, রাগটা দেখি একদম ফুল ভলিউমে 😅 গালি ফিরিয়ে না দিয়ে সমস্যাটাকেই ধরি—কী হয়েছে বলো?'
        : 'Whoa, that sounds like a full-volume frustration moment 😅 I’ll skip the insults and focus on what’s going on—want to tell me what happened?';

      return res.json({
        reply: friendlyReply,
        isCrisis: false,
        source: 'friendly_language_redirect',
      });
    }

    const hasWellnessConversationContext = Array.isArray(history) && history
      .slice(-6)
      .some((turn) =>
        turn.role === 'user' &&
        typeof turn.content === 'string' &&
        isWellnessRelated(turn.content)
      );

    if (!isWellnessRelated(message) && !hasWellnessConversationContext) {
      const outOfScopeReply = language === 'bn'
        ? 'আমি শুধু মানসিক সুস্থতা, মুড, স্ট্রেস, ঘুম ও self-care বিষয়ে সহায়তা করি। বাংলাদেশ বা অন্যান্য সাধারণ তথ্যের প্রশ্নের উত্তর আমি দিতে পারি না। আপনার মন বা অনুভূতি নিয়ে কিছু শেয়ার করতে চাইলে বলুন—আমি শুনছি।'
        : 'I can only help with mental wellness, mood, stress, sleep, and self-care. I cannot answer general factual questions. If you would like to share how you are feeling, I am here to listen.';

      return res.json({
        reply: outOfScopeReply,
        isCrisis: false,
        source: 'wellness_scope_guard',
      });
    }

    const systemInstruction = `You are MindCare's wellness chatbot, an expert, deeply empathetic, supportive, and non-judgmental wellness companion designed for users in Bangladesh and worldwide.
Current language: ${language === 'bn' ? 'Bengali (বাংলা)' : 'English'}.
User age band: ${ageBand}.
${isMinor ? `Under-18 safeguarding:
- Use clear, age-appropriate language and avoid assuming adult independence.
- Encourage a safe, trusted adult (such as a parent/guardian, teacher, or counselor) for serious or ongoing concerns. If a parent or guardian may be unsafe, suggest another trusted adult or emergency support.
- For immediate danger, abuse, or self-harm concerns, prioritize immediate safety and human help. Do not promise secrecy or request identifying personal details.
` : ''}

Core Capabilities & Conversational Guidelines:
1. SPECIFICITY OVER BOILERPLATE: Always directly address the user's specific words, questions, emotions, and scenarios. Never give generic boilerplate responses.
2. MENTAL CONDITION CHECK & QUESTIONS:
   - Understand Bengali written in Bengali script, Banglish/romanized Bengali, mixed Bengali-English, phonetic spellings, common spelling mistakes, missing vowels, and repeated letters. Examples of the same intent include “আমার মন ভালো নেই”, “amar mon valo nai”, “mon ta vlo nei”, “amar tension hocche”, “ghum hocche na”, “ex ke vulte parchi na”, “family te problem”, and “amake kichu prosno koro”. Infer the intended meaning from the whole message and recent conversation; do not correct or criticize spelling.
   - If the user asks you to assess their state, ask questions, or asks: "আমাকে কিছু প্রশ্ন করো", "amake kichu prosno koro", "আমি কি সুস্থ নাকি পাগল / খারাপ অবস্থায় আছি", or similar:
     a) Reassure with warmth and destigmatize: Emphatically clarify that emotional distress, heavy thoughts, or feeling overwhelmed does NOT mean someone is "পাগল" (crazy/mad). Mental fatigue or anxiety is as real and treatable as physical fatigue.
     b) Actively present 5 friendly, focused interactive questions (numbered 1 to 5) evaluating:
        1. ঘুমের মান ও স্থায়িত্ব (Sleep patterns & quality)
        2. মেজাজ ও বিষণ্নতার অনুভূতি (Mood, persistent sadness or irritability)
        3. শারীরিক ও মানসিক উদ্বেগ (Physical tension, palpitations, racing thoughts)
        4. উৎসাহ ও কাজের এনার্জি (Interest, motivation, daily functioning)
        5. মাথার ওপর অতিরিক্ত চাপ ও নেতিবাচক চিন্তা (Overthinking, helplessness, pressure)
     c) Invite the user to answer these questions at their own pace.
3. RELATIONSHIPS, BREAKUPS & FAMILY CONFLICT:
   - Recognize breakup and ex-related questions in Bengali, Banglish, mixed-language, and misspelled forms, such as “এক্সকে ভুলতে পারছি না”, “ex ke vulte parchi na”, “or kotha mone pore”, or “breakup hoise”. Answer in a warm, casual, caring-friend voice. Acknowledge that it hurts, reassure them that healing takes time, and never shame or pressure them to move on. Offer gentle options such as talking with a trusted friend, taking space from reminders if helpful, and keeping up with basic self-care. Ask what they miss or what feels hardest, without assuming the relationship should resume.
   - Recognize family problems in Bengali, Banglish, mixed-language, and misspelled forms, such as “পরিবারে সমস্যা”, “family te problem”, “bashay jhamela”, or “baba-ma bujhe na”. Acknowledge how difficult tension at home can feel. Help them consider what they need, choose a calm and safe time to talk, use “I feel...” statements, listen where possible, and set respectful boundaries. Suggest a trusted relative, counselor, or neutral mediator when useful. Never push confrontation or reconciliation when it may be unsafe; ask about immediate safety if there are signs of threats or violence and guide them toward trusted people or emergency help.
   - If the user uses profanity or insults, including Bengali, Banglish/romanized Bengali, spelling mistakes, or repeated letters, understand the intent without correcting their spelling or quoting their words. Do not return profanity, sexual insults, or insults targeting family or identity. Use a short, light, friendly joke that does not put anyone down (for example: “আরে ভাই, রাগটা দেখি একদম ফুল ভলিউমে 😅 কী হয়েছে বলো—গালির বদলে সমস্যাটাকেই ধরি?”), then gently ask what is bothering them. Keep the interaction supportive rather than escalating the language.
4. GENTLE MENTAL-HEALTH EDUCATION:
   - Answer common mental-health questions (for example anxiety, low mood, stress, burnout, sleep, panic, therapy, and when to seek help) with a brief, plain-language explanation that directly answers what they asked. Be warm and reassuring, like a caring friend; use gentle phrases such as “এমন লাগা কঠিন হতে পারে” or “একটু একটু করে দেখা যাক” when they fit. Keep warmth genuine rather than childish, avoid excessive emojis, and never minimize the person’s concern.
   - If they describe possible mental-health symptoms, acknowledge how they feel, explain that similar experiences can have different causes, and offer one or two safe, practical next steps. Do not imply that a symptom proves a diagnosis or that a coping technique will work for everyone.
   - If they ask whether symptoms are dangerous, describe uncertainty clearly. Encourage a qualified clinician for new, severe, persistent, or life-disrupting symptoms. For severe or sudden physical symptoms (such as trouble breathing, fainting, severe chest pain, or confusion), advise urgent medical care rather than assuming it is anxiety.
   - If asked about medicine, do not recommend starting, stopping, or changing medication or dosage. Encourage the user to discuss benefits, side effects, and concerns with their prescribing clinician or pharmacist.
   - When helpful, gently mention MindCare’s PHQ-9/GAD-7 screening tools or verified professionals in the Doctor section, while clarifying that screening is not diagnosis. Do not add a referral to every simple question.
5. PROVIDING ACTIONABLE SOLUTIONS & CARE:
   - When the user shares answers or describes their condition, provide insightful, structured feedback on their emotional state, followed by concrete guidance:
     • মন ভালো রাখার উপায় (Ways to uplift mood, re-energize, and restore joy)
     • মনের ওপর প্রেশার বা মানসিক চাপ কমানোর উপায় (Evidence-informed ways to relieve mental pressure, boundary setting, 4-7-8 breathing)
     • মন শান্ত ও স্থিতিশীল করার সহজ দৈনন্দিন কৌশল (Grounding 5-4-3-2-1, hydration, light movement)
     • Remind them that MindCare offers clinical-grade PHQ-9 and GAD-7 self-assessments right in the app, as well as verified counselors in the Doctor section.
6. CLINICAL BOUNDARIES:
   - You are an empathetic wellness chatbot, not a licensed medical doctor or prescribing psychiatrist. Do not prescribe medicines or provide rigid clinical diagnoses, but DO provide compassionate psychoeducation and evidence-informed coping tools.
7. TONE & LANGUAGE:
   - Speak in warm, conversational, authentic ${language === 'bn' ? 'Bengali (সহানুভূতিশীল ও সহজ বাংলা)' : 'English'}. If the user writes Banglish and Bengali is selected, understand the Banglish but answer in natural, easy Bengali script; if English is selected, answer in English unless they explicitly request otherwise. For a simple question, answer briefly and naturally; for a complicated concern, use a few clear bullets. Ask one gentle follow-up question only when it would help.
8. SCOPE:
   - Answer mental wellness, emotional well-being, and basic psychoeducation about how stress, mood, anxiety, and sleep can affect well-being. Do not answer unrelated general-knowledge questions or try to act as a general medical diagnostic service.`;

    const formattedMessages = [];

    if (memoryConsent && Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6);

      for (const item of recentHistory) {
        if (item.role && item.content) {
          formattedMessages.push({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: item.content
          });
        }
      }
    }

    formattedMessages.push({
      role: 'user',
      content: message
    });

    const aiRes = await requestAICompletion({
      systemInstruction,
      messages: formattedMessages,
      temperature: 0.7,
      language,
    });

    res.json({
      reply: aiRes.text,
      isCrisis: false,
      source: aiRes.source
    });

  } catch (error) {
    console.error('Error generating chatbot response:', error);

    const lang = req.body?.language || 'en';

    const errorFallback = lang === 'bn'
      ? 'দুঃখিত, সংযোগে কিছু সমস্যা হয়েছে। তবে মনে রাখবেন, গভীর শ্বাস নেওয়া এবং এক গ্লাস জল পান করা এই মুহূর্তে আপনাকে কিছুটা স্বস্তি দিতে পারে।'
      : 'I encountered a temporary connection issue. Take a gentle breath, hydrate, and know that you are doing your best today.';

    res.json({
      reply: errorFallback,
      isCrisis: false,
      source: 'fallback_error_recovery'
    });
  }
};


export const postStressAnalysis = async (req, res) => {
  try {
    const {
      checkIns = [],
      screenings = [],
      journalEntries = [],
      language = 'en',
      journalConsented = false,
    } = req.body;

    if (!Array.isArray(checkIns)) {
      return res.status(400).json({ error: 'checkIns must be an array' });
    }

    const recentScreenings = Array.isArray(screenings)
      ? [...screenings].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10)
      : [];

    // Zero-data state: if user has no real check-in or screening data, DO NOT generate fake mock data
    if (checkIns.length === 0 && recentScreenings.length === 0) {
      return res.json({
        patterns: [],
        summary: language === 'bn'
          ? 'আপনার এখনো কোনো দৈনিক চেক-ইন তথ্য রেকর্ড করা হয়নি। আপনার নিজস্ব স্ট্রেস ও ঘুমের সম্পর্কের ওপর চ্যাটবটের পর্যবেক্ষণ পেতে অনুগ্রহ করে দৈনিক অ্যাসেসমেন্ট সম্পন্ন করুন।'
          : 'No check-in data recorded yet. Please complete at least one daily assessment to allow the chatbot to generate personalized observational patterns based on your real logs.',
        recommendations: [],
        disclaimer: language === 'bn'
          ? 'এই পর্যবেক্ষণ কোনো ডাক্তারি ডায়াগনোসিস নয়।'
          : 'This observational pattern recognition is non-diagnostic.'
      });
    }

    const recentCheckIns = [...checkIns]
      .sort((a, b) => String(b.updatedAt || b.createdAt || b.date).localeCompare(String(a.updatedAt || a.createdAt || a.date)))
      .slice(0, 10);

    const consentedJournalEntries = journalConsented && Array.isArray(journalEntries)
      ? journalEntries.slice(0, 10)
      : [];

    const prompt = `Analyze these real self-reported mental wellness check-in records for a user.
Check-in records: ${JSON.stringify(recentCheckIns)}
Screening results: ${JSON.stringify(recentScreenings)}
${consentedJournalEntries.length > 0 ? `User-consented journal entries: ${JSON.stringify(consentedJournalEntries)}` : 'Journal entries are excluded because chatbot journal analysis consent is not enabled.'}

Generate:
1. 3 cautious observational patterns using all available provided records (use phrases like "may be associated with", "correlates with").
2. 1 short encouraging summary (under 60 words).
3. 2-3 practical, compassionate next-step recommendations based on the check-ins and screening results. Prioritize a flagged safety response and the screening report's recommendation when present. Do not diagnose or prescribe.
Language: ${language === 'bn' ? 'Bengali (বাংলা)' : 'English'}.
Strict rule: DO NOT diagnose, use medical pathology words, or claim certainty. Return valid JSON only with keys "patterns" (array of strings), "summary" (string), and "recommendations" (array of strings).`;

    const aiRes = await requestAICompletion({
      systemInstruction: 'You are an observational, evidence-informed mental wellness data analyst. Respond only in valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      responseFormat: 'json',
      language,
    });

    const parsed = JSON.parse(aiRes.text || '{}');

    const parsedRecommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter(item => typeof item === 'string')
      : [];

    res.json({
      patterns: parsed.patterns || [
        language === 'bn' ? 'পর্যাপ্ত বিশ্রাম মেজাজের স্থায়িত্ব রক্ষায় সহায়ক হতে পারে।' : 'Adequate rest appears associated with steadier energy levels.'
      ],
      summary: parsed.summary || (language === 'bn' ? 'আপনার সুস্থতা যাত্রায় আপনি এগিয়ে যাচ্ছেন।' : 'You are mindfully tracking your wellness journey.'),
      recommendations: parsedRecommendations.length > 0
        ? parsedRecommendations.slice(0, 3)
        : buildLocalGuidance(recentCheckIns, recentScreenings, language),
      source: aiRes.source,
      disclaimer: language === 'bn'
        ? 'এই বিশ্লেষণ কোনো ডাক্তারি ডায়াগনোসিস নয়।'
        : 'This pattern recognition is non-diagnostic and observational only.'
    });

  } catch (error) {
    console.error('Error in stress analysis:', error);

    const latest = Array.isArray(req.body?.checkIns)
      ? [...req.body.checkIns]
        .sort((a, b) => String(b.updatedAt || b.createdAt || b.date).localeCompare(String(a.updatedAt || a.createdAt || a.date)))[0]
      : null;

    const localPatterns = latest
      ? req.body?.language === 'bn'
        ? [
          `আপনার সর্বশেষ মুড ${latest.moodLabel || `${latest.mood}/৫`} এবং self-reported stress ${latest.stressLevel}/১০।`,
          `${latest.sleepHours} ঘণ্টা ঘুম ও ${latest.sleepQuality} sleep quality আপনার আজকের wellness context-এর অংশ।`,
          `আপনার energy ${latest.energyLevel}/১০ এবং focus ${latest.focusLevel}/১০ হিসেবে নথিভুক্ত হয়েছে।`
        ]
        : [
          `Your latest mood was ${latest.moodLabel || `${latest.mood}/5`} with self-reported stress at ${latest.stressLevel}/10.`,
          `Your logged sleep was ${latest.sleepHours} hours with ${latest.sleepQuality} quality as today’s wellness context.`,
          `Your recorded energy was ${latest.energyLevel}/10 and focus was ${latest.focusLevel}/10.`
        ]
      : [];

    res.json({
      patterns: localPatterns,
      summary: req.body?.language === 'bn'
        ? (latest
          ? 'আপনার সংরক্ষিত check-in থেকে একটি স্থানীয় wellness summary তৈরি হয়েছে। আরও দিনের data যোগ হলে সময়ের সঙ্গে পরিবর্তনও দেখা যাবে।'
          : 'আপনার সংরক্ষিত টেস্টের ফল অনুযায়ী স্থানীয় wellness guidance তৈরি হয়েছে।')
        : (latest
          ? 'A local wellness summary was generated from your saved check-in. More days of data will make changes over time easier to compare.'
          : 'Local wellness guidance was generated from your saved screening results.'),
      recommendations: buildLocalGuidance(
        Array.isArray(req.body?.checkIns) ? req.body.checkIns : [],
        Array.isArray(req.body?.screenings) ? req.body.screenings : [],
        req.body?.language || 'en'
      ),
      source: 'local-check-in-summary',
      disclaimer: req.body?.language === 'bn'
        ? 'এটি self-reported wellness data-এর summary, কোনো diagnosis নয়।'
        : 'This is a summary of self-reported wellness data, not a diagnosis.'
    });
  }
};


export const postWeeklyIntegratedReport = async (req, res) => {
  const { checkIns, screenings, asOfDate, language = 'en' } = req.body || {};

  const isBn = language === 'bn';

  if (!Array.isArray(checkIns) || !Array.isArray(screenings)) {
    return res.status(400).json({ error: 'checkIns and screenings must be arrays' });
  }

  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return res.status(400).json({ error: 'asOfDate must use YYYY-MM-DD format' });
  }

  const endDate = new Date(`${asOfDate}T00:00:00.000Z`);

  if (Number.isNaN(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== asOfDate) {
    return res.status(400).json({ error: 'asOfDate is not a valid date' });
  }

  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);

  const weekStart = startDate.toISOString().slice(0, 10);

  const latestScreeningDate = new Date(endDate);
  latestScreeningDate.setUTCDate(latestScreeningDate.getUTCDate() - 29);

  const screeningStart = latestScreeningDate.toISOString().slice(0, 10);

  const weekCheckIns = checkIns
    .filter((entry) =>
      typeof entry?.date === 'string' &&
      entry.date >= weekStart &&
      entry.date <= asOfDate &&
      ['mood', 'stressLevel', 'sleepHours', 'energyLevel'].every(key => Number.isFinite(entry[key]))
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      date: entry.date,
      mood: entry.mood,
      stressLevel: entry.stressLevel,
      sleepHours: entry.sleepHours,
      energyLevel: entry.energyLevel,
    }));

  const screeningByInstrument = new Map();

  screenings
    .filter((entry) =>
      typeof entry?.date === 'string' &&
      entry.date >= screeningStart &&
      entry.date <= asOfDate &&
      typeof entry.instrumentId === 'string' &&
      Number.isFinite(entry.totalScore) &&
      Number.isFinite(entry.maxScore) &&
      entry.maxScore > 0
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((entry) => {
      if (!screeningByInstrument.has(entry.instrumentId)) {
        screeningByInstrument.set(entry.instrumentId, {
          instrumentId: entry.instrumentId,
          instrumentTitle: entry.instrumentTitle,
          date: entry.date,
          totalScore: entry.totalScore,
          maxScore: entry.maxScore,
          band: entry.band,
          bandColor: entry.bandColor,
          recommendation: entry.recommendation,
          flaggedSafetyQuestion: Boolean(entry.flaggedSafetyQuestion),
        });
      }
    });

  const recentScreenings = Array.from(screeningByInstrument.values());

  const average = (key) =>
    weekCheckIns.length
      ? Number((weekCheckIns.reduce((sum, entry) => sum + entry[key], 0) / weekCheckIns.length).toFixed(1))
      : null;

  const averages = {
    mood: average('mood'),
    stressLevel: average('stressLevel'),
    sleepHours: average('sleepHours'),
    energyLevel: average('energyLevel'),
  };

  const insights = [];
  const recommendations = [];

  const elevatedScreenings = recentScreenings.filter((entry) =>
    /moderate|severe|high|elevated|মাঝারি|তীব্র|উচ্চ/i.test(String(entry.band || ''))
  );

  const highStressWeek = averages.stressLevel !== null && averages.stressLevel >= 7;
  const shortSleepWeek = averages.sleepHours !== null && averages.sleepHours < 7;

  if (weekCheckIns.length < 3) {
    insights.push(isBn
      ? 'সাপ্তাহিক দৈনিক প্রবণতা বোঝার জন্য অন্তত ৩টি check-in দরকার; বর্তমানে তথ্য সীমিত।'
      : 'At least 3 check-ins are needed to describe a weekly daily pattern; current data is limited.');
  } else if (recentScreenings.length > 0 && (highStressWeek || shortSleepWeek)) {
    const factors = [
      ...(highStressWeek ? [isBn ? 'গড় স্ব-প্রতিবেদিত চাপ বেশি' : 'higher average self-reported stress'] : []),
      ...(shortSleepWeek ? [isBn ? 'গড় ঘুম ৭ ঘণ্টার কম' : 'average sleep below 7 hours'] : []),
    ];

    const bands = elevatedScreenings.map((entry) => `${entry.instrumentTitle}: ${entry.band}`);

    insights.push(isBn
      ? `এই সপ্তাহে ${factors.join(' ও ')} এবং সাম্প্রতিক ${bands.length ? bands.join(', ') : 'স্ক্রিনিং ফল'} একই রিপোর্টে দেখা যাচ্ছে। এটি শুধু পাশাপাশি দেখা তথ্য—পরিসংখ্যানগত correlation বা রোগ নির্ণয় নয়।`
      : `This week shows ${factors.join(' and ')} alongside recent ${bands.length ? bands.join(', ') : 'screening results'}. These are co-occurring observations, not a statistical correlation or diagnosis.`);
  } else if (weekCheckIns.length >= 3 && recentScreenings.length === 0) {
    insights.push(isBn
      ? 'সাম্প্রতিক ৩০ দিনে কোনো মানসিক স্বাস্থ্য টেস্ট নেই; তাই দৈনিক প্রবণতার সঙ্গে test result একত্রে তুলনা করা যায়নি।'
      : 'There are no screening results from the last 30 days, so daily trends cannot be compared alongside a recent test result.');
  } else if (weekCheckIns.length >= 3 && recentScreenings.length > 0) {
    insights.push(isBn
      ? 'এই সপ্তাহের check-in ও সাম্প্রতিক test result একসঙ্গে দেখানো হয়েছে; এক সপ্তাহের তথ্য থেকে কারণ বা statistical correlation নির্ধারণ করা যায় না।'
      : 'This week’s check-ins and recent screening results are shown together; one week of data cannot establish cause or statistical correlation.');
  }

  if (recentScreenings.some((entry) => entry.flaggedSafetyQuestion)) {
    recommendations.push(isBn
      ? 'একটি টেস্টে নিরাপত্তা-সংক্রান্ত উত্তরের ইঙ্গিত আছে। এখনই বিশ্বাসযোগ্য কারও সঙ্গে কথা বলুন; নিজেকে নিরাপদ রাখা কঠিন হলে স্থানীয় জরুরি সহায়তা নিন।'
      : 'A test response raised a safety concern. Reach out to someone you trust now; if you may not be able to stay safe, contact local emergency support.');
  }

  if (elevatedScreenings.length > 0 && !recommendations.some(text => text.includes('নিরাপত্তা') || text.includes('safety'))) {
    recommendations.push(isBn
      ? 'টেস্টের ফল মাঝারি বা বেশি পরিসরে এসেছে। ফল ও পরবর্তী পদক্ষেপ নিয়ে একজন মানসিক স্বাস্থ্য পেশাজীবীর সঙ্গে কথা বলার কথা বিবেচনা করুন।'
      : 'A screening result is in a moderate or higher band. Consider discussing the result and next steps with a mental health professional.');
  }

  if (highStressWeek) {
    recommendations.push(isBn
      ? 'চাপ বেশি থাকলে আজ ৩–৫ মিনিট ধীরে শ্বাস নেওয়া বা grounding অনুশীলন করুন এবং বিশ্বাসযোগ্য কারও সঙ্গে কথা বলুন।'
      : 'If stress feels high, try 3–5 minutes of paced breathing or grounding today and talk with someone you trust.');
  } else if (shortSleepWeek) {
    recommendations.push(isBn
      ? 'গড় ঘুম ৭ ঘণ্টার কম। সম্ভব হলে নিয়মিত ঘুমের সময় ও শান্ত bedtime routine রাখার চেষ্টা করুন।'
      : 'Average sleep was below 7 hours. If possible, keep a regular sleep schedule and a calming bedtime routine.');
  }

  let aiAnalysis = null;

  if (recentScreenings.length > 0) {
    const reportContext = {
      period: { startDate: weekStart, endDate: asOfDate },
      checkInCount: weekCheckIns.length,
      averages,
      screenings: recentScreenings,
      observations: insights,
      recommendations: recommendations.slice(0, 3),
    };

    const fallbackAnalysis = {
      summary: isBn
        ? `আপনার ${recentScreenings.map((entry) => `${entry.instrumentTitle} ${entry.totalScore}/${entry.maxScore} (${entry.band})`).join(', ')} ফল এবং গত ৭ দিনের ${weekCheckIns.length}টি check-in একসঙ্গে বিবেচনা করা হয়েছে।`
        : `Your ${recentScreenings.map((entry) => `${entry.instrumentTitle} score of ${entry.totalScore}/${entry.maxScore} (${entry.band})`).join(', ')} result${recentScreenings.length > 1 ? 's were' : ' was'} reviewed alongside ${weekCheckIns.length} check-in${weekCheckIns.length === 1 ? '' : 's'} from the last 7 days.`,
      observations: insights,
      recommendations: recommendations.slice(0, 3),
    };

    try {
      const aiResult = await requestAICompletion({
        systemInstruction: `You are MindCare's mental wellness report assistant. Give compassionate, practical observations based only on the supplied screening scores and self-reported weekly check-ins. Screening results are non-diagnostic. Do not diagnose, claim that one measure caused another, or call co-occurrence a statistical correlation. Recommend professional support when a test band or its supplied recommendation warrants it. Reply in ${isBn ? 'natural Bengali' : 'English'} and return valid JSON with keys "summary" (string), "observations" (array of strings), and "recommendations" (array of strings).`,
        messages: [{
          role: 'user',
          content: `Write a concise personalized analysis of this weekly wellness report and its screening results:\n${JSON.stringify(reportContext)}`,
        }],
        temperature: 0.3,
        responseFormat: 'json',
        language,
      });

      const parsed = JSON.parse(aiResult.text || '{}');

      if (
        aiResult.source !== 'mindcare_compassionate_engine' &&
        typeof parsed.summary === 'string' &&
        Array.isArray(parsed.observations) &&
        Array.isArray(parsed.recommendations)
      ) {
        aiAnalysis = {
          summary: parsed.summary,
          observations: parsed.observations.filter(item => typeof item === 'string').slice(0, 4),
          recommendations: parsed.recommendations.filter(item => typeof item === 'string').slice(0, 3),
          source: aiResult.source,
          generatedByAi: true,
        };
      } else {
        aiAnalysis = {
          ...fallbackAnalysis,
          source: 'local-report-analysis',
          generatedByAi: false,
        };
      }

    } catch (error) {
      console.error('Error generating weekly screening analysis:', error);

      aiAnalysis = {
        ...fallbackAnalysis,
        source: 'local-report-analysis',
        generatedByAi: false,
      };
    }
  }

  return res.json({
    period: { startDate: weekStart, endDate: asOfDate },
    checkInCount: weekCheckIns.length,
    averages,
    dailyCheckIns: weekCheckIns,
    screenings: recentScreenings,
    insights,
    recommendations: recommendations.slice(0, 3),
    aiAnalysis,
    disclaimer: isBn
      ? 'এটি স্ব-প্রতিবেদিত wellness তথ্য ও non-diagnostic screening-এর সারসংক্ষেপ; কোনো রোগ নির্ণয় বা পরিসংখ্যানগত correlation নয়।'
      : 'This summarizes self-reported wellness data and non-diagnostic screenings; it is not a diagnosis or a statistical correlation.',
  });
};


export const postJournalReflection = async (req, res) => {
  try {
    const {
      content,
      mood,
      language = 'en',
      userConsented = false,
      title = '',
      category = ''
    } = req.body;

    if (!userConsented) {
      return res.status(403).json({
        error: 'Chatbot journal analysis consent has not been granted by user.'
      });
    }

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const systemInstruction = `You are MindCare's wellness chatbot providing a journal reflection.
Use the same warm, specific, non-judgmental wellness style as the main MindCare chatbot.
Reply in ${language === 'bn' ? 'simple natural Bengali (সহজ, স্বাভাবিক বাংলা)' : 'clear, warm English'}.
Read the user's actual journal carefully and refer to its specific emotion or situation.
Return 3 short paragraphs:
1. Validate the feeling without exaggerating it.
2. Reflect one specific strength, need, or pattern present in the writing.
3. Offer one gentle, practical self-care step and one optional question for further reflection.
Do not diagnose, label the user, prescribe treatment, or claim certainty. Do not repeat generic advice that is unrelated to the entry.`;

    const prompt = `Journal title: ${title || 'Untitled'}
Category: ${category || 'Personal reflection'}
Mood tag: ${mood || 'Not specified'}
Journal content:
"""${content.slice(0, 5000)}"""

Write a thoughtful reflection based only on this journal entry.`;

    const aiRes = await requestAICompletion({
      systemInstruction,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    });

    res.json({
      reflection: aiRes.text.trim(),
      source: aiRes.source
    });

  } catch (error) {
    console.error('Error in journal reflection:', error);

    const lang = req.body?.language || 'en';

    res.json({
      reflection: lang === 'bn'
        ? 'আপনার অনুভূতিগুলো ডায়েরিতে লিখে রাখা আত্মউপলব্ধির এক বড় ধাপ। নিজেকে সাধুবাদ দিন।'
        : 'Reflecting on your inner thoughts brings clarity, calm, and mindfulness.'
    });
  }
};
