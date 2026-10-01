export interface ScheduleEvidence {
  label: string;
  value: string;
}

export interface ScheduleExplanation {
  answer: string;
  evidence: ScheduleEvidence[];
  limitations: string[];
}

export interface ExplanationContext {
  schedule: unknown;
  assignments: unknown[];
  jobs: unknown[];
  machines: unknown[];
  timeZone: string;
}

export interface ExplanationProvider {
  explain(question: string, context: ExplanationContext): Promise<ScheduleExplanation>;
}

function parseProviderResponse(value: unknown): ScheduleExplanation {
  if (!value || typeof value !== 'object') throw new Error('AI provider returned an invalid response');
  const candidate = value as Record<string, unknown>;
  const answer = typeof candidate['answer'] === 'string' ? candidate['answer'].trim() : '';
  const evidence = Array.isArray(candidate['evidence'])
    ? candidate['evidence'].filter((item): item is ScheduleEvidence => (
      Boolean(item) && typeof item === 'object' &&
      typeof (item as Record<string, unknown>)['label'] === 'string' &&
      typeof (item as Record<string, unknown>)['value'] === 'string'
    ))
    : [];
  const limitations = Array.isArray(candidate['limitations'])
    ? candidate['limitations'].filter((item): item is string => typeof item === 'string')
    : [];

  if (!answer) throw new Error('AI provider returned an empty answer');
  return { answer, evidence, limitations };
}

export class GeminiExplanationProvider implements ExplanationProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = 'gemini-3.5-flash-lite') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async explain(question: string, context: ExplanationContext): Promise<ScheduleExplanation> {
    const prompt = [
      'You are ShopFlow, a production scheduling assistant for a CNC job shop.',
      'Answer the planner using only the supplied schedule context.',
      'Do not invent facts, do not recommend database mutations, and say when the context is insufficient.',
      'When a selected assignment is present, explain that exact assignment using its eligible machines, setup duration, processing duration, predecessor timing, due date, and completion time.',
      'ShopFlow selects the eligible machine with the earliest feasible completion time after considering machine availability, setup time, processing time, and job precedence. Use this as the scheduling rationale when the context supports it.',
      'When candidate analysis is present, compare the candidate completion times and explicitly name the winner and the closest alternatives.',
      `Format every date and time in the planner's local timezone (${context.timeZone}), using human-readable dates such as "Oct 2, 2026 at 10:35 PM". Do not expose ISO timestamps or internal UUIDs in the answer.`,
      'For a selected operation, your answer must explicitly state this rationale in plain language before listing the supporting facts.',
      'If candidate score details are not present, explicitly say that the context does not include the scheduler\'s complete candidate comparison rather than pretending to know it.',
      'Return only valid JSON with this exact shape:',
      '{"answer":"string","evidence":[{"label":"string","value":"string"}],"limitations":["string"]}',
      `Planner question: ${question}`,
      `Schedule context: ${JSON.stringify(context)}`,
    ].join('\n');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini request failed with status ${response.status}: ${errorBody.slice(0, 500)}`);
    }
    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no explanation');
    const jsonText = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return parseProviderResponse(JSON.parse(jsonText));
  }
}

export function getExplanationProvider(): ExplanationProvider | null {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) return null;
  return new GeminiExplanationProvider(apiKey, process.env['GEMINI_MODEL'] || undefined);
}
