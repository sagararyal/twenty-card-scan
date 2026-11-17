// Whether the Twenty server has any AI model to read cards with. Twenty lists its models
// in the public client config; a self-hosted server without AI keys lists none.
let cached: { value: boolean; at: number } | null = null;

export const isAiAvailable = async (): Promise<boolean> => {
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;

  const apiUrl = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');

  try {
    const response = await fetch(`${apiUrl}/client-config`, { signal: AbortSignal.timeout(5000) });
    const config = (await response.json()) as { aiModels?: unknown[] };
    const value = Array.isArray(config.aiModels) && config.aiModels.length > 0;

    cached = { value, at: Date.now() };

    return value;
  } catch {
    // Unknown: assume a model is there, so a card is never left unread by mistake.
    return true;
  }
};
