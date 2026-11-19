import crypto from 'node:crypto';
import { AIProviderKeyConfigModel, isMongoConnected } from '../models/database.js';

const CONFIG_ID = 'ai-provider-keys';
const CACHE_TTL_MS = 15_000;
const providerCache = new Map();
const activeKeyIds = new Map();
let openRouterProviderCache = null;

function providerFields(provider) {
  return provider === 'gemini'
    ? { keys: 'geminiKeys', environment: 'useGeminiEnvironmentKeys', preferred: 'preferredGeminiKeyId' }
    : { keys: 'openaiKeys', environment: 'useOpenAIEnvironmentKeys', preferred: 'preferredOpenAIKeyId' };
}

function environmentKeys(provider) {
  const raw = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  return (raw || '')
    .split(/[\r\n,]+/)
    .map(value => value.trim())
    .filter(Boolean)
    .map((value, index) => ({
      id: `env-${provider}-${index + 1}`,
      value,
      source: 'environment',
    }));
}

function encryptionKey() {
  const secret = process.env.AI_KEYS_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Set AI_KEYS_ENCRYPTION_SECRET to a random secret of at least 32 characters before managing AI keys.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptKey(value, id) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(id, 'utf8'));
  const encryptedKey = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    id,
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    lastFour: value.slice(-4),
  };
}

function decryptKey(record) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(record.id, 'utf8'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedKey, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function loadStoredConfig() {
  if (!isMongoConnected) return null;
  return AIProviderKeyConfigModel.findOne({ id: CONFIG_ID }).lean();
}

function orderedKeys(provider, keys, preferredKeyId) {
  const activeKeyId = activeKeyIds.get(provider);
  if (!activeKeyId && !preferredKeyId) return keys;
  const rank = id => (id === activeKeyId ? 0 : id === preferredKeyId ? 1 : 2);
  return [...keys].sort((a, b) => rank(a.id) - rank(b.id));
}

export async function getRuntimeAIKeys(provider) {
  const now = Date.now();
  const cached = providerCache.get(provider);
  if (cached && cached.expiresAt > now) return orderedKeys(provider, cached.keys, cached.preferredKeyId);

  let storedKeys = [];
  let useEnvironmentKeys = true;
  let preferredKeyId = null;
  try {
    const config = await loadStoredConfig();
    if (config) {
      const fields = providerFields(provider);
      storedKeys = config[fields.keys].map(record => ({
        id: record.id,
        value: decryptKey(record),
        source: 'admin',
      }));
      useEnvironmentKeys = config[fields.environment] ?? true;
      preferredKeyId = config[fields.preferred] || null;
    }
  } catch (error) {
    console.error('Unable to load encrypted AI provider keys:', error);
    throw error;
  }

  const keys = [
    ...storedKeys,
    ...(useEnvironmentKeys ? environmentKeys(provider) : []),
  ];
  providerCache.set(provider, { keys, useEnvironmentKeys, preferredKeyId, expiresAt: now + CACHE_TTL_MS });
  return orderedKeys(provider, keys, preferredKeyId);
}

export function markAIKeyActive(provider, id) {
  activeKeyIds.set(provider, id);
}

export function markOpenRouterKeyActive(providerId, id) {
  activeKeyIds.set(`openrouter:${providerId}`, id);
}

export function getCachedActiveAIKeyId(provider) {
  return activeKeyIds.get(provider) || null;
}

export function hasCachedAIProviderKeys() {
  return Array.from(providerCache.values()).some(cache => cache.keys.length > 0)
    || Boolean(openRouterProviderCache?.providers.length);
}

export async function hasConfiguredAIProviderKeys() {
  if (hasCachedAIProviderKeys()) return true;
  if (environmentKeys('gemini').length > 0 || environmentKeys('openai').length > 0) return true;
  const config = await loadStoredConfig();
  return Boolean(config && (
    config.geminiKeys.length > 0
    || config.openaiKeys.length > 0
    || config.customProviders.some(provider =>
      provider.enabledForAI
      && provider.integration === 'openrouter'
      && Boolean(provider.model?.trim())
      && provider.keys.length > 0
    )
  ));
}

export async function getRuntimeOpenRouterProviders() {
  if (openRouterProviderCache && openRouterProviderCache.expiresAt > Date.now()) {
    return openRouterProviderCache.providers.map(provider => ({
      ...provider,
      keys: orderedKeys(`openrouter:${provider.id}`, provider.keys, provider.preferredKeyId),
    }));
  }
  const config = await loadStoredConfig();
  const providers = (config?.customProviders || []).flatMap(provider => {
    const model = provider.model?.trim();
    if (!provider.enabledForAI || provider.integration !== 'openrouter' || !model || provider.keys.length === 0) {
      return [];
    }
    return [{
      id: provider.id,
      name: provider.name,
      model,
      preferredKeyId: provider.preferredKeyId || null,
      keys: provider.keys.map(key => ({
        id: key.id,
        value: decryptKey(key),
        source: 'admin',
      })),
    }];
  });
  openRouterProviderCache = { providers, expiresAt: Date.now() + CACHE_TTL_MS };
  return providers.map(provider => ({
    ...provider,
    keys: orderedKeys(`openrouter:${provider.id}`, provider.keys, provider.preferredKeyId),
  }));
}

export async function getAdminAIKeySettings() {
  const config = await loadStoredConfig();
  const settings = {};

  for (const provider of ['gemini', 'openai']) {
    const fields = providerFields(provider);
    const managedRecords = config?.[fields.keys] || [];
    const environment = environmentKeys(provider);
    const activeKeyId = getCachedActiveAIKeyId(provider);
    const preferredKeyId = config?.[fields.preferred] || null;
    const keys = [
      ...managedRecords.map(record => ({
        id: record.id,
        masked: `••••${record.lastFour}`,
        source: 'admin',
      })),
      ...environment.map(key => ({
        id: key.id,
        masked: `••••${key.value.slice(-4)}`,
        source: 'environment',
      })),
    ];
    settings[provider] = {
      keys: activeKeyId || preferredKeyId
        ? keys.sort((a, b) => {
          const rank = id => (id === activeKeyId ? 0 : id === preferredKeyId ? 1 : 2);
          return rank(a.id) - rank(b.id);
        })
        : keys,
      useEnvironmentKeys: config?.[fields.environment] ?? true,
      environmentConfigured: environment.length > 0,
      activeKeyId,
      preferredKeyId,
    };
  }

  return {
    ...settings,
    customProviders: (config?.customProviders || []).map(provider => {
      const activeKeyId = getCachedActiveAIKeyId(`openrouter:${provider.id}`);
      const preferredKeyId = provider.preferredKeyId || null;
      const keys = provider.keys.map(key => ({ id: key.id, masked: `••••${key.lastFour}` }));
      if (activeKeyId || preferredKeyId) {
        keys.sort((a, b) => {
          const rank = id => (id === activeKeyId ? 0 : id === preferredKeyId ? 1 : 2);
          return rank(a.id) - rank(b.id);
        });
      }
      return {
        id: provider.id,
        name: provider.name,
        keys,
        integration: provider.integration || null,
        model: provider.model || '',
        enabledForAI: Boolean(provider.enabledForAI && provider.integration === 'openrouter' && provider.model),
        preferredKeyId,
        activeKeyId,
      };
    }),
  };
}

async function getOrCreateAIKeyConfig() {
  if (!isMongoConnected) throw new Error('MongoDB storage is required to manage AI keys.');
  const config = await AIProviderKeyConfigModel.findOneAndUpdate(
    { id: CONFIG_ID },
    { $setOnInsert: { geminiKeys: [], openaiKeys: [], customProviders: [], useGeminiEnvironmentKeys: true, useOpenAIEnvironmentKeys: true } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  if (!config) throw new Error('Unable to initialize AI key storage.');
  return config;
}

export async function addAdminAIKeys(provider, values) {
  const config = await getOrCreateAIKeyConfig();
  const fields = providerFields(provider);
  const existing = config[fields.keys];
  const uniqueValues = [...new Set(values)];
  if (existing.length + uniqueValues.length > 20) throw new Error('A maximum of 20 keys per provider is allowed.');
  const existingValues = new Set(existing.map(record => decryptKey(record)));
  const newRecords = uniqueValues
    .filter(value => !existingValues.has(value))
    .map(value => encryptKey(value, crypto.randomUUID()));
  if (newRecords.length === 0) throw new Error('These API keys are already configured.');

  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    { $set: { [fields.keys]: [...existing, ...newRecords] } },
  );
  providerCache.delete(provider);
}

export async function removeAdminAIKey(provider, id) {
  if (!isMongoConnected) throw new Error('MongoDB storage is required to manage AI keys.');
  const fields = providerFields(provider);
  const config = await AIProviderKeyConfigModel.findOne({ id: CONFIG_ID }).lean();
  if (!config) return false;
  const existing = config[fields.keys];
  if (!existing.some(record => record.id === id)) return false;
  const update = {
    $set: { [fields.keys]: existing.filter(record => record.id !== id) },
  };
  if (config[fields.preferred] === id) update.$unset = { [fields.preferred]: 1 };
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    update,
  );
  if (activeKeyIds.get(provider) === id) activeKeyIds.delete(provider);
  providerCache.delete(provider);
  return true;
}

export async function replaceAdminAIKey(provider, id, value) {
  const config = await getOrCreateAIKeyConfig();
  const fields = providerFields(provider);
  const existing = config[fields.keys];
  if (!existing.some(record => record.id === id)) return false;
  if (existing.some(record => record.id !== id && decryptKey(record) === value)) {
    throw new Error('This API key is already configured for the provider.');
  }
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    { $set: { [fields.keys]: existing.map(record => (record.id === id ? encryptKey(value, id) : record)) } },
  );
  providerCache.delete(provider);
  return true;
}

export async function setUseEnvironmentAIKeys(provider, enabled) {
  await getOrCreateAIKeyConfig();
  const fields = providerFields(provider);
  await AIProviderKeyConfigModel.findOneAndUpdate(
    { id: CONFIG_ID },
    {
      $set: { [fields.environment]: enabled },
      $setOnInsert: { geminiKeys: [], openaiKeys: [] },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  providerCache.delete(provider);
  if (!enabled) {
    const config = await AIProviderKeyConfigModel.findOne({ id: CONFIG_ID }).lean();
    if (config?.[fields.preferred]?.startsWith(`env-${provider}-`)) {
      await AIProviderKeyConfigModel.updateOne({ id: CONFIG_ID }, { $unset: { [fields.preferred]: 1 } });
    }
    if (activeKeyIds.get(provider)?.startsWith(`env-${provider}-`)) activeKeyIds.delete(provider);
  }
}

export async function setPreferredAIKey(provider, id) {
  const config = await getOrCreateAIKeyConfig();
  const fields = providerFields(provider);
  const managedKeys = config[fields.keys] || [];
  const isManagedKey = managedKeys.some(record => record.id === id);
  const isEnabledEnvironmentKey = (config[fields.environment] ?? true)
    && environmentKeys(provider).some(key => key.id === id);
  if (!isManagedKey && !isEnabledEnvironmentKey) {
    throw new Error('Choose an available key for this provider.');
  }
  await AIProviderKeyConfigModel.updateOne({ id: CONFIG_ID }, { $set: { [fields.preferred]: id } });
  activeKeyIds.delete(provider);
  providerCache.delete(provider);
}

function normalizeProviderName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function encryptNewProviderKeys(values) {
  return [...new Set(values)].map(value => encryptKey(value, crypto.randomUUID()));
}

export async function addCustomAIProvider(name, values, model, enabledForAI) {
  const config = await getOrCreateAIKeyConfig();
  const normalizedName = normalizeProviderName(name);
  const existing = config.customProviders || [];
  if (existing.length >= 20) throw new Error('A maximum of 20 custom providers is allowed.');
  if (existing.some(provider => provider.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
    throw new Error('A provider with this name already exists.');
  }
  const keys = encryptNewProviderKeys(values);
  if (enabledForAI && (!model.trim() || keys.length === 0)) {
    throw new Error('Choose a model and add at least one key before enabling OpenRouter.');
  }
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: [
          ...existing,
          {
            id: crypto.randomUUID(),
            name: normalizedName,
            keys,
            ...(enabledForAI ? { integration: 'openrouter' } : {}),
            model: model.trim(),
            enabledForAI,
            preferredKeyId: keys[0]?.id,
          },
        ],
      },
    },
  );
  openRouterProviderCache = null;
}

export async function renameCustomAIProvider(id, name) {
  const config = await getOrCreateAIKeyConfig();
  const normalizedName = normalizeProviderName(name);
  const existing = config.customProviders || [];
  const provider = existing.find(item => item.id === id);
  if (!provider) return false;
  if (existing.some(item => item.id !== id && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
    throw new Error('A provider with this name already exists.');
  }
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    { $set: { customProviders: existing.map(item => (item.id === id ? { ...item, name: normalizedName } : item)) } },
  );
  openRouterProviderCache = null;
  return true;
}

export async function updateCustomAIProviderSettings(id, settings) {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === id);
  if (!provider) return false;
  const name = settings.name === undefined ? provider.name : normalizeProviderName(settings.name);
  const model = settings.model === undefined ? (provider.model || '') : settings.model.trim();
  const enabledForAI = settings.enabledForAI ?? Boolean(provider.enabledForAI);
  if (providers.some(item => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('A provider with this name already exists.');
  }
  if (enabledForAI && (!model || provider.keys.length === 0)) {
    throw new Error('Choose a model and add at least one key before enabling OpenRouter.');
  }
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => (item.id === id
          ? {
            ...item,
            name,
            model,
            enabledForAI,
            ...(enabledForAI ? { integration: 'openrouter' } : { integration: undefined }),
          }
          : item)),
      },
    },
  );
  openRouterProviderCache = null;
  return true;
}

export async function deleteCustomAIProvider(id) {
  const config = await getOrCreateAIKeyConfig();
  const existing = config.customProviders || [];
  if (!existing.some(provider => provider.id === id)) return false;
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    { $set: { customProviders: existing.filter(provider => provider.id !== id) } },
  );
  activeKeyIds.delete(`openrouter:${id}`);
  openRouterProviderCache = null;
  return true;
}

export async function addCustomAIProviderKeys(providerId, values) {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider) return false;
  const uniqueValues = [...new Set(values)];
  if (provider.keys.length + uniqueValues.length > 20) throw new Error('A maximum of 20 keys per provider is allowed.');
  const existingValues = new Set(provider.keys.map(key => decryptKey(key)));
  const additions = uniqueValues
    .filter(value => !existingValues.has(value))
    .map(value => encryptKey(value, crypto.randomUUID()));
  if (additions.length === 0) throw new Error('These API keys are already configured.');
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => (item.id === providerId
          ? { ...item, keys: [...item.keys, ...additions] }
          : item)),
      },
    },
  );
  openRouterProviderCache = null;
  return true;
}

export async function replaceCustomAIProviderKey(providerId, keyId, value) {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider) return false;
  const keyExists = provider.keys.some(key => key.id === keyId);
  if (!keyExists) return false;
  if (provider.keys.some(key => key.id !== keyId && decryptKey(key) === value)) {
    throw new Error('This API key is already configured for the provider.');
  }
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => (item.id === providerId
          ? {
            ...item,
            keys: item.keys.map(key => (key.id === keyId ? encryptKey(value, keyId) : key)),
          }
          : item)),
      },
    },
  );
  openRouterProviderCache = null;
  return true;
}

export async function deleteCustomAIProviderKey(providerId, keyId) {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider || !provider.keys.some(key => key.id === keyId)) return false;
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => (item.id === providerId
          ? {
            ...item,
            keys: item.keys.filter(key => key.id !== keyId),
            preferredKeyId: item.preferredKeyId === keyId
              ? item.keys.find(key => key.id !== keyId)?.id
              : item.preferredKeyId,
          }
          : item)),
      },
    },
  );
  if (activeKeyIds.get(`openrouter:${providerId}`) === keyId) activeKeyIds.delete(`openrouter:${providerId}`);
  openRouterProviderCache = null;
  return true;
}

export async function setPreferredCustomAIKey(providerId, keyId) {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider || !provider.keys.some(key => key.id === keyId)) return false;
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => (item.id === providerId
          ? { ...item, preferredKeyId: keyId }
          : item)),
      },
    },
  );
  activeKeyIds.delete(`openrouter:${providerId}`);
  openRouterProviderCache = null;
  return true;
}