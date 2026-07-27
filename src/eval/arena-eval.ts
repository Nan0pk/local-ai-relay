import { findProviderForModel } from '../providers/registry.js';

export interface ArenaEvalPairResult {
  prompt: string;
  modelA: string;
  modelB: string;
  responseA: string;
  responseB: string;
  timestamp: string;
}

export async function evaluatePairwise(
  prompt: string,
  modelA = 'browser-chatgpt-free',
  modelB = 'browser-claude-free',
): Promise<ArenaEvalPairResult> {
  const providerA = findProviderForModel(modelA);
  const providerB = findProviderForModel(modelB);

  const req = {
    messages: [{ role: 'user' as const, content: prompt }],
  };

  const [resA, resB] = await Promise.all([
    providerA ? providerA.complete(req, modelA) : Promise.resolve({ choices: [{ message: { content: 'Provider A unavailable' } }] }),
    providerB ? providerB.complete(req, modelB) : Promise.resolve({ choices: [{ message: { content: 'Provider B unavailable' } }] }),
  ]);

  return {
    prompt,
    modelA,
    modelB,
    responseA: String(resA.choices[0]?.message.content ?? ''),
    responseB: String(resB.choices[0]?.message.content ?? ''),
    timestamp: new Date().toISOString(),
  };
}
