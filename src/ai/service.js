import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  getRuntimeAIKeys,
  getRuntimeOpenRouterProviders,
  hasConfiguredAIProviderKeys,
  markAIKeyActive,
  markOpenRouterKeyActive,
} from './keyStore.js';

export async function isAIAvailable() {
  try {
    return await hasConfiguredAIProviderKeys();
  } catch (error) {
    console.error('Unable to check configured AI providers:', error);
    return false;
  }
}

const providerKeyCooldowns = new Map();

function providerKeyCooldownKey(provider, keyId) {
  return `${provider}:${keyId}`;
}

function isProviderKeyCoolingDown(provider, keyId) {
  return (providerKeyCooldowns.get(providerKeyCooldownKey(provider, keyId)) || 0) > Date.now();
}

function isQuotaLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (typeof error === 'object' && error !== null) {
    if (error.status === 429 || error.code === 429) return true;
  }
  return /429|quota|resource[_\s-]*exhausted|rate[_\s-]*limit/i.test(message);
}

async function requestOpenRouterCompletion({
  systemInstruction,
  messages,
  temperature,
  responseFormat,
}) {
  const providers = await getRuntimeOpenRouterProviders();
  for (const provider of providers) {
    const cooldownProviderId = `openrouter:${provider.id}`;
    for (const key of provider.keys) {
      if (isProviderKeyCoolingDown(cooldownProviderId, key.id)) continue;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key.value}`,
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'system', content: systemInstruction }, ...messages],
            temperature,
            ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content;
          if (typeof content === 'string' && content) {
            providerKeyCooldowns.delete(providerKeyCooldownKey(cooldownProviderId, key.id));
            markOpenRouterKeyActive(provider.id, key.id);
            return { text: content, source: `openrouter:${provider.model}` };
          }
          console.warn(`OpenRouter model ${provider.model} returned an empty completion.`);
        } else {
          const errorBody = await response.json().catch(() => ({}));
          const errorMessage = errorBody?.error?.message || response.statusText;
          const quotaLimit = response.status === 429 || /quota|rate.?limit/i.test(String(errorMessage));
          providerKeyCooldowns.set(
            providerKeyCooldownKey(cooldownProviderId, key.id),
            Date.now() + (quotaLimit || response.status === 401 ? 15 * 60 * 1000 : 30 * 1000),
          );
          console.warn(`OpenRouter request returned status ${response.status}; trying the next key/provider.`);
        }
      } catch (error) {
        providerKeyCooldowns.set(providerKeyCooldownKey(cooldownProviderId, key.id), Date.now() + 30 * 1000);
        console.warn('OpenRouter request failed; trying the next key/provider:', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }
  return null;
}

async function requestOpenAICompletion({
  systemInstruction,
  messages,
  temperature,
  responseFormat,
}) {
  const keys = await getRuntimeAIKeys('openai');
  for (const key of keys) {
    if (isProviderKeyCoolingDown('openai', key.id)) continue;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key.value}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemInstruction }, ...messages],
          temperature,
          ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content) {
          providerKeyCooldowns.delete(providerKeyCooldownKey('openai', key.id));
          markAIKeyActive('openai', key.id);
          return { text: content, source: 'openai-gpt-4o-mini' };
        }
        console.warn('OpenAI API returned an empty completion; trying the next key.');
      } else {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = errorBody?.error?.message || response.statusText;
        const quotaLimit = response.status === 429 || /quota|rate.?limit/i.test(String(errorMessage));
        const cooldownMs = quotaLimit || response.status === 401
          ? 15 * 60 * 1000
          : 30 * 1000;
        providerKeyCooldowns.set(providerKeyCooldownKey('openai', key.id), Date.now() + cooldownMs);
        console.warn(`OpenAI API returned status ${response.status}; trying the next key.`, errorMessage);
      }
    } catch (error) {
      providerKeyCooldowns.set(providerKeyCooldownKey('openai', key.id), Date.now() + 30 * 1000);
      console.warn('OpenAI request failed; trying the next key:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

async function requestGeminiCompletion({
  systemInstruction,
  contents,
  responseFormat,
}) {
  const keys = await getRuntimeAIKeys('gemini');
  for (const key of keys) {
    if (isProviderKeyCoolingDown('gemini', key.id)) continue;
    let quotaLimit = false;
    const client = new GoogleGenAI({
      apiKey: key.value,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    for (const model of ['gemini-3.1-flash-lite', 'gemini-3.8-flash']) {
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            ...(model === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            ...(responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
          },
        });
        if (response?.text) {
          providerKeyCooldowns.delete(providerKeyCooldownKey('gemini', key.id));
          markAIKeyActive('gemini', key.id);
          return { text: response.text.trim(), source: model };
        }
        console.warn(`Gemini ${model} returned an empty completion; trying the next model or key.`);
      } catch (error) {
        quotaLimit ||= isQuotaLimitError(error);
        console.warn(`Gemini ${model} request failed; trying the next model or key:`, error instanceof Error ? error.message : 'Unknown error');
        if (quotaLimit) break;
      }
    }
    providerKeyCooldowns.set(
      providerKeyCooldownKey('gemini', key.id),
      Date.now() + (quotaLimit ? 15 * 60 * 1000 : 30 * 1000),
    );
  }
  return null;
}

// Generates warm, compassionate, non-clinical wellness responses when external network is constrained
function generateEmpatheticFallback(userQuery, language = 'bn') {
  const query = (userQuery || '').toLowerCase();
  const isBn = language === 'bn';

  if (isBn) {
    if (query === 'hi' || query === 'hello' || query === 'হাই' || query === 'হ্যালো' || query === 'আসসালামু আলাইকুম') {
      return 'হ্যালো! আমি আপনার কথা শুনতে প্রস্তুত। এই মুহূর্তে আপনার মন কেমন আছে?';
    }
    if (query.includes('প্রশ্ন') || query.includes('question') || query.includes('পাগল') || query.includes('সুস্থ') || query.includes('condition') || query.includes('অবস্থা') || query.includes('টেস্ট') || query.includes('test')) {
      return `প্রথমেই একটি বিষয় আপনাকে আশ্বস্ত করতে চাই—মানসিক চাপ, ক্লান্তি বা অতিরিক্ত দুশ্চিন্তা থাকা মানেই কেউ 'পাগল' হয়ে যাওয়া নয়। শারীরিক অসুস্থতার মতোই মনের ওপরও বিভিন্ন সময়ে অতিরিক্ত প্রেশার তৈরি হয় এবং সঠিক যত্নে মন আবার পুরোপুরি স্বাভাবিক ও সতেজ হয়ে ওঠে।\n\nআপনার মনের বর্তমান অবস্থা বুঝতে এবং আপনাকে কার্যকর পরামর্শ দিতে আমাকে নিচের ৫টি সহজ প্রশ্নের উত্তর দিন:\n\n১. **ঘুমের অবস্থা:** গত কয়েকদিন আপনার ঘুম কেমন হচ্ছে? (মাঝরাতে ভেঙে যাওয়া বা সহজে ঘুম না আসার সমস্যা আছে কি?)\n২. **মন ও মেজাজের অনুভূতি:** দিনের বেশিরভাগ সময় কি মন ভারী, বিষণ্ন বা খিটখিটে লাগছে?\n৩. **শারীরিক ও মানসিক অস্থিরতা:** কোনো নির্দিষ্ট বিষয় বা কারণ ছাড়াই কি বুক ধড়ফড় করা বা অতিরিক্ত ভয়/টেনশন কাজ করছে?\n৪. **আগ্রহ ও কাজের শক্তি:** যেসব কাজ আপনি আগে উপভোগ করতেন, এখন কি সেগুলোতে অনীহা বা অতিরিক্ত ক্লান্তি অনুভব করছেন?\n৫. **অতিরিক্ত চিন্তা (Overthinking):** মাথায় কি বারবার একই নেতিবাচক বা আশঙ্কাজনক চিন্তা ঘুরপাক খাচ্ছে?\n\nআপনি একটি একটি করে বা একসাথে যেভাবে সহজ মনে হয় লিখে জানান। আপনার উত্তরের ওপর ভিত্তি করে আমরা আপনার বর্তমান মানসিক চাপ মূল্যায়ন করব এবং মন হালকা ও ভালো রাখার সহজ কৌশলগুলো ঠিক করব।`;
    }
    if (query.includes('ঘুম') || query.includes('sleep') || query.includes('রাত')) {
      return `আপনার ঘুমের সমস্যা বা ক্লান্তি আপনার শারীরিক ও মানসিক অবস্থাকে প্রভাবিত করতে পারে।\n\nকিছু সহজ টিপস:\n• ঘুমানোর অন্তত ৩০ মিনিট আগে মোবাইল বা স্ক্রিন দূরে রাখুন।\n• ৪-৭-৮ শ্বাসপ্রশ্বাসের কৌশল চেষ্টা করুন (৪ সেকেন্ড নাক দিয়ে শ্বাস নিন, ৭ সেকেন্ড ধরে রাখুন, এবং ৮ সেকেন্ডে মুখ দিয়ে ধীরে ধীরে ছাড়ুন)।\n• ঘরের আলো মৃদু রাখুন এবং শান্ত পরিবেশ তৈরি করুন।\n\nনিজের যত্ন নেওয়ার জন্য শরীরকে পর্যাপ্ত সময় দিন।`;
    }
    if (query.includes('উদ্বেগ') || query.includes('অস্থির') || query.includes('ভয়') || query.includes('টেনশন') || query.includes('চাপ') || query.includes('stress') || query.includes('anxiety')) {
      return `আমি বুঝতে পারছি যে আপনি এই মুহূর্তে কিছুটা অস্থিরতা বা মানসিক চাপ অনুভব করছেন। এই অনুভূতিগুলো খুবই স্বাভাবিক এবং আপনি একা নন।\n\nনিজেকে তাৎক্ষণিকভাবে শান্ত করতে এই পদক্ষেপগুলো করতে পারেন:\n১. **৫-৪-৩-২-১ গ্রাউন্ডিং টেকনিক:** আপনার চারপাশের ৫টি জিনিস লক্ষ্য করুন, ৪টি জিনিস স্পর্শ করুন, ৩টি শব্দ শুনুন, ২টি গন্ধ অনুভব করুন এবং ১টি দীর্ঘ গভীর শ্বাস নিন।\n২. এক গ্লাস স্বাভাবিক জল পান করুন এবং কাঁধের পেশীগুলো শিথিল করুন।\n\nমনে রাখবেন, কোনো অনুভূতিই স্থায়ী নয়—আপনি ধীরে ধীরে স্বাভাবিক অবস্থায় ফিরে আসবেন।`;
    }
    if (
      query.includes('খারাপ') ||
      query.includes('কষ্ট') ||
      query.includes('মন') ||
      query.includes('বিষাদ') ||
      query.includes('sad') ||
      query.includes('alone') ||
      query.includes('একা') ||
      query.includes('mon valo nai') ||
      query.includes('mon bhalo nei') ||
      query.includes('mon kharap') ||
      query.includes('amar mon valo') ||
      query.includes('amar mon bhalo')
    ) {
      return `আপনার কষ্টের কথা ভাগ করে নেওয়ার জন্য ধন্যবাদ। যখন অনুভূতিগুলো মনের ভেতর জমে থাকে, তখন মন অনেক ভারী লাগে।\n\n• নিজেকে সময় দিন; মন খারাপ হওয়া কোনো দুর্বলতা নয়।\n• পছন্দের কোনো শান্ত গান শুনতে পারেন বা খোলা বাতাসে কয়েক মিনিট হাঁটতে পারেন।\n• আপনার অনুভূতিগুলো ডায়েরিতে লিখে রাখতে পারেন।\n\nআপনি অনেক মূল্যবান, এবং নিজেকে একটু মমতা দেওয়ার চেষ্টা করুন।`;
    }
    return `আমি আপনার কথা আন্তরিকভাবে শুনেছি। আপনার মনের কথা খোলাখুলি শেয়ার করার জন্য ধন্যবাদ।\n\nমানসিক চাপ কমাতে ও মন ভালো রাখতে কিছু দ্রুত পরামর্শ:\n• প্রতিদিন ছোট ছোট বিরতি নিন এবং বুক ভরে ৩ বার গভীর শ্বাস নিন।\n• মনের ওপর একবারে বেশি কাজের চাপ না নিয়ে একটি একটি করে সম্পূর্ণ করুন।\n• নিজের প্রিয় কোনো শখ বা প্রিয় মানুষের সাথে ১০ মিনিট মন খুলে কথা বলুন।\n\nআপনি চাইলে আপনার মনের বর্তমান অবস্থা সম্পর্কে আমাকে বিস্তারিত বলতে পারেন—আমি আপনাকে সাহায্য করার জন্য প্রস্তুত।`;
  } else {
    if (query.includes('question') || query.includes('test') || query.includes('crazy') || query.includes('condition') || query.includes('insane') || query.includes('healthy')) {
      return `First, please be reassured: experiencing deep stress, exhaustion, or intense emotions does NOT mean you are "crazy". Just like the body gets fatigued, the mind experiences cognitive and emotional overload that is entirely treatable with mindful care.\n\nTo help understand your current mental state, please answer these 5 simple check-in questions:\n\n1. **Sleep Patterns:** How has your sleep been over the past week (trouble falling asleep, waking up early)?\n2. **Daily Mood:** Do you feel down, irritable, or emotionally numb most of the day?\n3. **Physical & Nervous Tension:** Are you experiencing racing thoughts, palpitations, or restlessness?\n4. **Energy & Interest:** Have you lost joy or motivation in activities you usually enjoy?\n5. **Overwhelm & Pressure:** Do you feel that life's demands are too heavy to carry right now?\n\nTake your time to reply. Based on your answers, I will provide targeted strategies to relieve pressure and uplift your mood.`;
    }
    if (query.includes('sleep') || query.includes('insomnia') || query.includes('tired')) {
      return `Sleep challenges can deeply affect your daytime energy and emotional calm.\n\nGentle steps you can try tonight:\n• Disconnect from electronic screens 30-45 minutes before sleep.\n• Try 4-7-8 deep breathing: Inhale for 4s, hold for 7s, exhale for 8s.\n• Keep your sleeping area cool and dark.\n\nBe patient with yourself—your body knows how to heal with rest.`;
    }
    if (query.includes('anxiety') || query.includes('anxious') || query.includes('stress') || query.includes('panic') || query.includes('overwhelm')) {
      return `I hear the stress you are experiencing, and it is completely understandable to feel overwhelmed.\n\nTry this quick 5-4-3-2-1 Grounding exercise right now:\n1. Notice 5 things you can see around you.\n2. Touch 4 things near you.\n3. Listen for 3 distinct sounds.\n4. Notice 2 aromas.\n5. Take 1 slow, deep diaphragmatic breath.\n\nTake it one breath at a time. You are safe in this moment.`;
    }
    return `Thank you for sharing your thoughts with me. Self-care begins with giving yourself permission to pause and breathe.\n\n• Take three deep breaths through your nose and out through your mouth.\n• Drink a glass of water and gently roll your shoulders back.\n• Take small, manageable steps today without pressuring yourself.\n\nI am here to support you whenever you need to reflect or unwind.`;
  }
}

// Clean and sanitize messages for Gemini API
function sanitizeGeminiContents(messages) {
  const contents = [];

  for (const m of messages) {
    if (!m.content || !m.content.trim()) continue;
    const role = m.role === 'assistant' ? 'model' : 'user';

    // Gemini API requires the first turn to have role 'user'
    if (contents.length === 0 && role === 'model') {
      continue;
    }

    // Merge consecutive turns with the same role
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n\n${m.content}`;
    } else {
      contents.push({
        role,
        parts: [{ text: m.content }],
      });
    }
  }

  // Ensure at least one valid user message exists
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return contents;
}

export async function requestAICompletion({
  systemInstruction,
  messages,
  temperature = 0.7,
  responseFormat,
  language = 'bn',
}) {
  // Extract last user message for fallback matching
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  try {
    const openRouterResult = await requestOpenRouterCompletion({
      systemInstruction,
      messages,
      temperature,
      responseFormat,
    });
    if (openRouterResult) return openRouterResult;
  } catch (error) {
    console.error('Unable to load OpenRouter provider keys:', error);
  }

  // OpenAI keys are followed by Gemini keys as provider fallbacks.
  try {
    const openAIResult = await requestOpenAICompletion({
      systemInstruction,
      messages,
      temperature,
      responseFormat,
    });
    if (openAIResult) return openAIResult;
  } catch (error) {
    console.error('Unable to load OpenAI provider keys:', error);
  }

  try {
    const contents = sanitizeGeminiContents(messages);
    const geminiResult = await requestGeminiCompletion({ systemInstruction, contents, responseFormat });
    if (geminiResult) return geminiResult;
  } catch (error) {
    console.error('Unable to load Gemini provider keys:', error);
  }

  // Resilient instant compassionate fallback engine.
  if (responseFormat === 'json') {
    return {
      text: JSON.stringify({
        patterns: [
          language === 'bn' ? 'নিয়মিত বিরতিতে বিশ্রাম মানসিক ভারসাম্য বজায় রাখতে সহায়তা করে।' : 'Regular rest intervals support emotional stability.',
          language === 'bn' ? 'দৈনিক অনুভূতি পর্যবেক্ষণ স্ট্রেস কমাতে ভূমিকা রাখে।' : 'Daily mood tracking helps recognize personal stressors.',
        ],
        summary: language === 'bn' ? 'আপনার সার্বিক সুস্থতা যাত্রায় আপনি সচেষ্ট আছেন।' : 'You are mindfully tracking your wellness journey.',
      }),
      source: 'mindcare_compassionate_engine',
    };
  }

  return {
    text: generateEmpatheticFallback(lastUserMsg, language),
    source: 'mindcare_compassionate_engine',
  };
}

// Crisis safety keywords for immediate safety protocol
const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'cutting myself',
  'আত্মহত্যা', 'মরতে চাই', 'নিজেকে শেষ', 'জীবন শেষ',
];

export function checkCrisis(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (CRISIS_KEYWORDS.some(kw => lower.includes(kw))) return true;

  const romanized = lower
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/(.)\1{2,}/gu, '$1')
    .trim();
  return /\b(?:mor(?:te)? chai|more jete chai|(?:nijeke|nijer) (?:sesh|shesh|ses|shes)(?: korte| kore dite)? chai|jibon (?:sesh|shesh)(?: korte| kore dite)? chai|ar bachte chai na|bachte chai na|suicide korte chai)\b/i.test(romanized);
}

const PROFANITY_TOKEN_PATTERNS = [
  /^(?:mad(?:ar|er)(?:ch[oau]d)?|bon(?:ch(?:od)?)|behench(?:od)?|banch(?:od|o)?|bokach(?:od)?a?|chudir?(?:bhai)?|chud[ai]|gud(?:ar)?|khank(?:i|ir)?|fokinn(?:i|ir)?|haramjad(?:a|i)?|kutt(?:a|ar)(?:r)?|shuy?or(?:er)?|chagol(?:er)?|bessh(?:a|ar)?|magi(?:r)?|shala|shali|bal(?:er)?|pagol|pagli)$/i,
  /^(?:মাদারচ[\p{L}\p{M}]*|মাদেরচ[\p{L}\p{M}]*|বোনচ[\p{L}\p{M}]*|বেহেনচ[\p{L}\p{M}]*|বানচ[\p{L}\p{M}]*|শালা|শালি|কুত্তা|কুত্তার|হারামজাদ[\p{L}\p{M}]*|মাগি|মাগির|খানকি|খানকির|বেশ্যা|বেশ্যার|বাল|বালের|চুদি|চুদা|গুদ|গুদার|শুয়োরের|শুয়োরের|ছাগলের|বোকাচো[\p{L}\p{M}]*|ফকিন্নি|ফকিন্নির|পাগল|পাগলি|চুদির)$/u,
  /^(?:fuck|fucking|shit|bitch|asshole|bastard|damn|idiot|stupid)$/i,
];

export function containsProfanity(text) {
  const tokens = text
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/(.)\1{2,}/gu, '$1')
    .split(/\s+/)
    .filter(Boolean);

  return tokens.some(token => PROFANITY_TOKEN_PATTERNS.some(pattern => pattern.test(token)));
}

const BANGLISH_WELLNESS_TERMS = [
  'breakup', 'brokeup', 'missingex', 'forgetex',
  'family', 'parents', 'poribar', 'poribarer', 'bashay', 'basay', 'barite', 'jhamela',
  'stress', 'tension', 'anxiety', 'panic', 'depressed', 'depression',
  'mental', 'health', 'mood', 'mon', 'mone', 'feel', 'feeling',
  'sadness', 'kharap', 'valo', 'bhalo', 'kosto', 'koshto', 'dukho',
  'chinta', 'duschinta', 'udbeg', 'ghum', 'sleep', 'overthink',
  'lonely', 'ekla', 'eka', 'rag', 'bhoy', 'voy', 'kanna', 'kandte', 'pagol',
  'shanti', 'calm', 'help', 'counselor', 'counselling', 'therapist',
  'relationship', 'moner', 'lagche', 'lagse', 'parchi', 'vulte', 'bhule',
  'vule', 'partesi', 'partesina', 'kotha', 'monepore', 'moneporche', 'bari', 'vlo', 'balo',
  'nijeke', 'nijer', 'sesh', 'shesh', 'sustho', 'osustho', 'pagol', 'normal',
  'prosno', 'problem', 'assessment',
];

function isOneCharacterTypo(value, expected) {
  if (Math.abs(value.length - expected.length) > 1) return false;

  let valueIndex = 0;
  let expectedIndex = 0;
  let differences = 0;

  while (valueIndex < value.length && expectedIndex < expected.length) {
    if (value[valueIndex] === expected[expectedIndex]) {
      valueIndex += 1;
      expectedIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > 1) return false;

    if (value.length > expected.length) valueIndex += 1;
    else if (expected.length > value.length) expectedIndex += 1;
    else {
      valueIndex += 1;
      expectedIndex += 1;
    }
  }

  if (valueIndex < value.length || expectedIndex < expected.length) differences += 1;
  return differences <= 1;
}

export function isWellnessRelated(text) {
  const query = text
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/(.)\1{2,}/gu, '$1')
    .trim();
  const wellnessTerms = [
    'মন', 'মেজাজ', 'কষ্ট', 'দুঃখ', 'খারাপ', 'চাপ', 'টেনশন', 'উদ্বেগ', 'ভয়', 'ঘুম',
    'একা', 'কান্না', 'অস্থির', 'শান্ত', 'বিষণ্ন', 'বিষন্ন', 'আত্মহত্যা', 'মানসিক', 'স্বাস্থ্য',
    'mood', 'mind', 'mon', 'valo', 'bhalo', 'nai', 'kharap', 'sad', 'happy', 'stress', 'anxiety', 'panic', 'sleep', 'lonely',
    'depressed', 'depression', 'mental', 'feel', 'feeling', 'tension', 'worry',
    'upset', 'cry', 'calm', 'suicide', 'self harm', 'hello', 'hi', 'হাই', 'হ্যালো',
    'breakup', 'break up', 'broke up', 'ex ', 'ex.', 'family', 'parents', 'পরিবার', 'ব্রেকআপ', 'এক্স',
    'পরিবারে', 'বাসায়', 'বাড়িতে', 'বাড়িতে', 'ঝামেলা', 'বিচ্ছেদ', 'প্রাক্তন',
    'ভালো', 'ভাল', 'দুশ্চিন্তা', 'দুশ্চিনতা', 'বিষন্ন', 'বিষণ্ণ',
  ];
  if (wellnessTerms.some(term => query.includes(term)) || containsProfanity(text)) return true;

  const tokens = query.split(/\s+/).filter(token => /^[a-z]+$/.test(token) && token.length >= 3);
  if (/\bex\b/i.test(query)) return true;
  return tokens.some(token => BANGLISH_WELLNESS_TERMS.some(term => isOneCharacterTypo(token, term)));
}

export function buildLocalGuidance(checkIns, screenings, language) {
  const isBn = language === 'bn';
  const latestCheckIn = [...checkIns]
    .sort((a, b) => String(b.updatedAt || b.createdAt || b.date).localeCompare(String(a.updatedAt || a.createdAt || a.date)))[0];
  const latestScreening = screenings[0];
  const recommendations = [];

  if (latestScreening?.flaggedSafetyQuestion) {
    recommendations.push(isBn
      ? 'টেস্টে নিরাপত্তা-সংক্রান্ত উত্তরের ইঙ্গিত আছে। এখনই বিশ্বাসযোগ্য কারও সঙ্গে কথা বলুন; নিজেকে নিরাপদ রাখা কঠিন হলে স্থানীয় জরুরি সহায়তা নিন।'
      : 'A test response raised a safety concern. Reach out to someone you trust now; if you may not be able to stay safe, contact local emergency support.');
  } else if (latestScreening?.recommendation) {
    recommendations.push(String(latestScreening.recommendation));
  }

  if (latestCheckIn?.stressLevel >= 8) {
    recommendations.push(isBn
      ? 'আজ ৩–৫ মিনিট ধীরে শ্বাস নেওয়া বা grounding অনুশীলন করুন, তারপর বিশ্বাসযোগ্য কারও সঙ্গে আপনার চাপের কথা ভাগ করুন।'
      : 'Try 3–5 minutes of paced breathing or grounding today, then share how you are feeling with someone you trust.');
  } else if (latestCheckIn?.stressLevel >= 5) {
    recommendations.push(isBn
      ? 'কাজের মাঝে ছোট বিরতি নিয়ে কয়েক মিনিট ধীরে শ্বাস নিন; পরের check-in-এ চাপের পরিবর্তন লিখুন।'
      : 'Take a short break for a few minutes of slow breathing, then note any change in your next check-in.');
  } else if (latestCheckIn?.sleepHours < 7) {
    recommendations.push(isBn
      ? 'আজ রাতে ঘুমের জন্য একটু আগে থেকে শান্ত হওয়ার রুটিন রাখার চেষ্টা করুন।'
      : 'Try starting a calming bedtime routine a little earlier tonight.');
  } else if (latestCheckIn) {
    recommendations.push(isBn
      ? 'যে দৈনন্দিন অভ্যাসগুলো আপনাকে ভালো রাখে সেগুলো চালিয়ে যান এবং নিয়মিত check-in করুন।'
      : 'Continue the routines that support you and keep checking in regularly.');
  }

  if (latestScreening?.flaggedSafetyQuestion && latestCheckIn?.stressLevel >= 8) {
    recommendations.push(isBn
      ? 'নিজেকে নিরাপদ রাখতে অসুবিধা হলে একা থাকবেন না এবং জরুরি সহায়তার সঙ্গে যোগাযোগ করুন।'
      : 'If staying safe feels difficult, do not stay alone and contact emergency support.');
  }

  return recommendations.slice(0, 3);
}