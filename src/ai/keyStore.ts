import crypto from 'node:crypto';
import {
  AIProviderKeyConfigModel,
  isMongoConnected,
  type AIProviderKeyConfigRecord,
  type CustomAIProviderRecord,
  type EncryptedAIKeyRecord,
} from '../models/database';

export type AIProvider = 'gemini' | 'openai';

export interface RuntimeAIKey {
  id: string;
  value: string;
  source: 'admin' | 'environment';
}

export interface AdminAIKeyInfo {
  id: string;
  masked: string;
  source: 'admin' | 'environment';
}

export interface AdminCustomAIProvider {
  id: string;
  name: string;
  keys: Array<{ id: string; masked: string }>;
  integration: 'openrouter' | null;
  model: string;
  enabledForAI: boolean;
  preferredKeyId: string | null;
  activeKeyId: string | null;
}

export interface RuntimeOpenRouterProvider {
  id: string;
  name: string;
  model: string;
  keys: RuntimeAIKey[];
  preferredKeyId: string | null;
}

interface ProviderCache {
  keys: RuntimeAIKey[];
  useEnvironmentKeys: boolean;
  preferredKeyId: string | null;
  expiresAt: number;
}

const CONFIG_ID = 'ai-provider-keys';
const CACHE_TTL_MS = 15_000;
const providerCache = new Map<AIProvider, ProviderCache>();
const activeKeyIds = new Map<string, string>();
let openRouterProviderCache: { providers: RuntimeOpenRouterProvider[]; expiresAt: number } | null = null;

function providerFields(provider: AIProvider) {
  return provider === 'gemini'
    ? { keys: 'geminiKeys', environment: 'useGeminiEnvironmentKeys', preferred: 'preferredGeminiKeyId' } as const
    : { keys: 'openaiKeys', environment: 'useOpenAIEnvironmentKeys', preferred: 'preferredOpenAIKeyId' } as const;
}

function environmentKeys(provider: AIProvider): RuntimeAIKey[] {
  const raw = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  return (raw || '')
    .split(/[\r\n,]+/)
    .map(value => value.trim())
    .filter(Boolean)
    .map((value, index) => ({
      id: `env-${provider}-${index + 1}`,
      value,
      source: 'environment' as const,
    }));
}

function encryptionKey(): Buffer {
  const secret = process.env.AI_KEYS_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Set AI_KEYS_ENCRYPTION_SECRET to a random secret of at least 32 characters before managing AI keys.');
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encryptKey(value: string, id: string): EncryptedAIKeyRecord {
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

function decryptKey(record: EncryptedAIKeyRecord): string {
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

async function loadStoredConfig(): Promise<AIProviderKeyConfigRecord | null> {
  if (!isMongoConnected) return null;
  return AIProviderKeyConfigModel.findOne({ id: CONFIG_ID }).lean<AIProviderKeyConfigRecord>();
}

function orderedKeys(provider: string, keys: RuntimeAIKey[], preferredKeyId: string | null): RuntimeAIKey[] {
  const activeKeyId = activeKeyIds.get(provider);
  if (!activeKeyId && !preferredKeyId) return keys;
  const rank = (id: string) => id === activeKeyId ? 0 : id === preferredKeyId ? 1 : 2;
  return [...keys].sort((a, b) => rank(a.id) - rank(b.id));
}

export async function getRuntimeAIKeys(provider: AIProvider): Promise<RuntimeAIKey[]> {
  const now = Date.now();
  const cached = providerCache.get(provider);
  if (cached && cached.expiresAt > now) return orderedKeys(provider, cached.keys, cached.preferredKeyId);

  let storedKeys: RuntimeAIKey[] = [];
  let useEnvironmentKeys = true;
  let preferredKeyId: string | null = null;
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

export function markAIKeyActive(provider: AIProvider, id: string): void {
  activeKeyIds.set(provider, id);
}

export function markOpenRouterKeyActive(providerId: string, id: string): void {
  activeKeyIds.set(`openrouter:${providerId}`, id);
}

export function getCachedActiveAIKeyId(provider: string): string | null {
  return activeKeyIds.get(provider) || null;
}

export function hasCachedAIProviderKeys(): boolean {
  return Array.from(providerCache.values()).some(cache => cache.keys.length > 0)
    || Boolean(openRouterProviderCache?.providers.length);
}

export async function hasConfiguredAIProviderKeys(): Promise<boolean> {
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

export async function getRuntimeOpenRouterProviders(): Promise<RuntimeOpenRouterProvider[]> {
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
        source: 'admin' as const,
      })),
    }];
  });
  openRouterProviderCache = { providers, expiresAt: Date.now() + CACHE_TTL_MS };
  return providers.map(provider => ({
    ...provider,
    keys: orderedKeys(`openrouter:${provider.id}`, provider.keys, provider.preferredKeyId),
  }));
}

export async function getAdminAIKeySettings(): Promise<Record<AIProvider, {
  keys: AdminAIKeyInfo[];
  useEnvironmentKeys: boolean;
  environmentConfigured: boolean;
  activeKeyId: string | null;
  preferredKeyId: string | null;
}> & { customProviders: AdminCustomAIProvider[] }> {
  const config = await loadStoredConfig();
  const settings = {} as Record<AIProvider, {
    keys: AdminAIKeyInfo[];
    useEnvironmentKeys: boolean;
    environmentConfigured: boolean;
    activeKeyId: string | null;
    preferredKeyId: string | null;
  }>;

  for (const provider of ['gemini', 'openai'] as const) {
    const fields = providerFields(provider);
    const managedRecords = config?.[fields.keys] || [];
    const environment = environmentKeys(provider);
    const activeKeyId = getCachedActiveAIKeyId(provider);
    const preferredKeyId = config?.[fields.preferred] || null;
    const keys = [
      ...managedRecords.map(record => ({
        id: record.id,
        masked: `••••${record.lastFour}`,
        source: 'admin' as const,
      })),
      ...environment.map(key => ({
        id: key.id,
        masked: `••••${key.value.slice(-4)}`,
        source: 'environment' as const,
      })),
    ];
    settings[provider] = {
      keys: activeKeyId || preferredKeyId
        ? keys.sort((a, b) => {
          const rank = (id: string) => id === activeKeyId ? 0 : id === preferredKeyId ? 1 : 2;
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
          const rank = (id: string) => id === activeKeyId ? 0 : id === preferredKeyId ? 1 : 2;
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

async function getOrCreateAIKeyConfig(): Promise<AIProviderKeyConfigRecord> {
  if (!isMongoConnected) throw new Error('MongoDB storage is required to manage AI keys.');
  const config = await AIProviderKeyConfigModel.findOneAndUpdate(
    { id: CONFIG_ID },
    { $setOnInsert: { geminiKeys: [], openaiKeys: [], customProviders: [], useGeminiEnvironmentKeys: true, useOpenAIEnvironmentKeys: true } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean<AIProviderKeyConfigRecord>();
  if (!config) throw new Error('Unable to initialize AI key storage.');
  return config;
}

export async function addAdminAIKeys(provider: AIProvider, values: string[]): Promise<void> {
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

export async function removeAdminAIKey(provider: AIProvider, id: string): Promise<boolean> {
  if (!isMongoConnected) throw new Error('MongoDB storage is required to manage AI keys.');
  const fields = providerFields(provider);
  const config = await AIProviderKeyConfigModel.findOne({ id: CONFIG_ID }).lean<AIProviderKeyConfigRecord>();
  if (!config) return false;
  const existing = config[fields.keys];
  if (!existing.some(record => record.id === id)) return false;
  const update: Record<string, unknown> = {
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

export async function replaceAdminAIKey(provider: AIProvider, id: string, value: string): Promise<boolean> {
  const config = await getOrCreateAIKeyConfig();
  const fields = providerFields(provider);
  const existing = config[fields.keys];
  if (!existing.some(record => record.id === id)) return false;
  if (existing.some(record => record.id !== id && decryptKey(record) === value)) {
    throw new Error('This API key is already configured for the provider.');
  }
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    { $set: { [fields.keys]: existing.map(record => record.id === id ? encryptKey(value, id) : record) } },
  );
  providerCache.delete(provider);
  return true;
}

export async function setUseEnvironmentAIKeys(provider: AIProvider, enabled: boolean): Promise<void> {
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
    const config = await AIProviderKeyConfigModel.findOne({ id: CONFIG_ID }).lean<AIProviderKeyConfigRecord>();
    if (config?.[fields.preferred]?.startsWith(`env-${provider}-`)) {
      await AIProviderKeyConfigModel.updateOne({ id: CONFIG_ID }, { $unset: { [fields.preferred]: 1 } });
    }
    if (activeKeyIds.get(provider)?.startsWith(`env-${provider}-`)) activeKeyIds.delete(provider);
  }
}

export async function setPreferredAIKey(provider: AIProvider, id: string): Promise<void> {
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

function normalizeProviderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function encryptNewProviderKeys(values: string[]): EncryptedAIKeyRecord[] {
  return [...new Set(values)].map(value => encryptKey(value, crypto.randomUUID()));
}

export async function addCustomAIProvider(
  name: string,
  values: string[],
  model: string,
  enabledForAI: boolean,
): Promise<void> {
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
            ...(enabledForAI ? { integration: 'openrouter' as const } : {}),
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

export async function renameCustomAIProvider(id: string, name: string): Promise<boolean> {
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
    { $set: { customProviders: existing.map(item => item.id === id ? { ...item, name: normalizedName } : item) } },
  );
  openRouterProviderCache = null;
  return true;
}

export async function updateCustomAIProviderSettings(
  id: string,
  settings: { name?: string; model?: string; enabledForAI?: boolean },
): Promise<boolean> {
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
        customProviders: providers.map(item => item.id === id
          ? {
            ...item,
            name,
            model,
            enabledForAI,
            ...(enabledForAI ? { integration: 'openrouter' as const } : { integration: undefined }),
          }
          : item),
      },
    },
  );
  openRouterProviderCache = null;
  return true;
}

export async function deleteCustomAIProvider(id: string): Promise<boolean> {
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

export async function addCustomAIProviderKeys(providerId: string, values: string[]): Promise<boolean> {
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
        customProviders: providers.map(item => item.id === providerId
          ? { ...item, keys: [...item.keys, ...additions] }
          : item),
      },
    },
  );
  openRouterProviderCache = null;
  return true;
}

export async function replaceCustomAIProviderKey(providerId: string, keyId: string, value: string): Promise<boolean> {
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
        customProviders: providers.map(item => item.id === providerId
          ? {
            ...item,
            keys: item.keys.map(key => key.id === keyId ? encryptKey(value, keyId) : key),
          }
          : item),
      },
    },
  );
  openRouterProviderCache = null;
  return true;
}

export async function deleteCustomAIProviderKey(providerId: string, keyId: string): Promise<boolean> {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider || !provider.keys.some(key => key.id === keyId)) return false;
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => item.id === providerId
          ? {
            ...item,
            keys: item.keys.filter(key => key.id !== keyId),
            preferredKeyId: item.preferredKeyId === keyId
              ? item.keys.find(key => key.id !== keyId)?.id
              : item.preferredKeyId,
          }
          : item),
      },
    },
  );
  if (activeKeyIds.get(`openrouter:${providerId}`) === keyId) activeKeyIds.delete(`openrouter:${providerId}`);
  openRouterProviderCache = null;
  return true;
}

export async function setPreferredCustomAIKey(providerId: string, keyId: string): Promise<boolean> {
  const config = await getOrCreateAIKeyConfig();
  const providers = config.customProviders || [];
  const provider = providers.find(item => item.id === providerId);
  if (!provider || !provider.keys.some(key => key.id === keyId)) return false;
  await AIProviderKeyConfigModel.updateOne(
    { id: CONFIG_ID },
    {
      $set: {
        customProviders: providers.map(item => item.id === providerId
          ? { ...item, preferredKeyId: keyId }
          : item),
      },
    },
  );
  activeKeyIds.delete(`openrouter:${providerId}`);
  openRouterProviderCache = null;
  return true;
}
