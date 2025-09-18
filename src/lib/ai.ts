export type AIProvider = 'gemini';

export type AIModelOption = {
  id: string;   // provider model id
  label: string; // human label
  provider: AIProvider;
  isDefault?: boolean;
};

export const AI_MODEL_OPTIONS: AIModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', isDefault: true },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'gemini' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
];

export const DEFAULT_MODEL_ID = (AI_MODEL_OPTIONS.find(o => o.isDefault)?.id) || 'gemini-2.5-flash';

// Local storage keys
export const LS_AI_MODEL = 'clarity:ai:model';
export const LS_AI_KEY = 'clarity:ai:apiKey';

export function getStoredAIModel(): string {
  try {
    const saved = localStorage.getItem(LS_AI_MODEL);
    return saved || DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

export function setStoredAIModel(id: string) {
  try { localStorage.setItem(LS_AI_MODEL, id); } catch {}
}

export function hasStoredAIKey(): boolean {
  try { return !!localStorage.getItem(LS_AI_KEY); } catch { return false; }
}

export function setStoredAIKey(key: string) {
  try { localStorage.setItem(LS_AI_KEY, key); } catch {}
}

export function clearStoredAIKey() {
  try { localStorage.removeItem(LS_AI_KEY); } catch {}
}

