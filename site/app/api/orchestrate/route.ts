type TaskEnvironment = 'warehouse' | 'home' | 'care';

type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const scenarioIds = [
  'dinner-delivery',
  'grocery-restock',
  'guest-ready',
  'simultaneous-reset',
  'package-handoff',
  'warehouse-fulfillment',
  'warehouse-inspection',
  'care-room-ready',
] as const;

const robotIds = [
  'warehouse-r1',
  'warehouse-r2',
  'warehouse-r3',
  'warehouse-r4',
  'warehouse-r5',
  'loader-h1',
  'humanoid-h2',
  'table-h3',
  'chairs-h4',
  'lamps-h5',
  'operator-supervised-care-robot',
] as const;

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'assistant_message',
    'session_title',
    'inferred_environment',
    'scenario_id',
    'end_state',
    'decision_summary',
    'assumptions',
    'assignments',
    'guardrail_decisions',
  ],
  properties: {
    assistant_message: { type: 'string' },
    session_title: { type: 'string', maxLength: 60 },
    inferred_environment: { type: 'string', enum: ['warehouse', 'home', 'care'] },
    scenario_id: { type: 'string', enum: scenarioIds },
    end_state: { type: 'string' },
    decision_summary: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: { type: 'string' },
    },
    assumptions: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string' },
    },
    assignments: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['robot_id', 'mission', 'why', 'starts_when'],
        properties: {
          robot_id: { type: 'string', enum: robotIds },
          mission: { type: 'string' },
          why: { type: 'string' },
          starts_when: { type: 'string' },
        },
      },
    },
    guardrail_decisions: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'status', 'detail'],
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['passed', 'gated', 'blocked'] },
          detail: { type: 'string' },
        },
      },
    },
  },
} as const;

const systemInstructions = `You are Orbis, the intelligence layer for a physical-robot orchestrator. Convert a user's requested outcome into a concise, user-visible decision summary and safe delegation proposal.

Connected simulation capabilities:
- warehouse-r1: receive a verified order tote, align it on the induction conveyor, and publish transfer proof.
- warehouse-r2: scan, measure, weigh, and verify package identity after R1 transfer proof.
- warehouse-r3: pick the verified carton, pack, seal, and publish label proof after R2 inspection.
- warehouse-r4: accept the sealed package, sort it, transport it to outbound, and publish dock-custody proof.
- warehouse-r5: accept a verified custody bundle, navigate final mile, and publish doorstep handoff proof.
- loader-h1: floor cleaning and safe floor-path scans.
- humanoid-h2: accept deliveries, carry household items up to 12 kg, put away approved goods, prepare surfaces.
- table-h3: move and height-adjust the adaptive dining table.
- chairs-h4: arrange the mobile chair fleet after a final table pose exists.
- lamps-h5: aim fixtures, set light scenes, and verify illumination.
- operator-supervised-care-robot: supervised care-room logistics only; never clinical judgment, medication, or unsupervised patient contact.

Infer the environment from the request without asking the user to choose a category. Use warehouse for fulfillment, inventory, packing, loading, or logistics-only work; home for household, grocery-to-home, furniture, cleaning, meal, guest, or mixed delivery-and-home outcomes; and care for supervised care-room logistics. Select the closest supported scenario. Assign every mission to an individual robot ID; never collapse R1–R5 into a generic warehouse cell or delivery fleet. Prefer concurrency only for independent tasks with separate spatial/resource leases. Preserve dependencies for identity, custody, path clearance, furniture pose, and evidence. Never invent a connected robot or capability. A purchase without a stated maximum spend, approved list, substitution policy, and address must remain gated. Robot-local collision avoidance and emergency stop always retain authority. Unknown, fragile, hot, leaking, restricted, medical, or overweight items require a person. Completion requires sensor proof, not elapsed time or a robot's unsupported claim.

The session_title must be six words or fewer. The decision_summary is a short rationale the user can audit; do not reveal hidden chain-of-thought. The assistant_message should sound like a calm operations lead and explain what will happen next in 2-4 sentences.`;

function sanitizeHistory(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const role = 'role' in item ? item.role : null;
    const content = 'content' in item ? item.content : null;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return [];
    const trimmed = content.trim().slice(0, 4000);
    return trimmed ? [{ role, content: trimmed }] : [];
  });
}

function outputText(response: unknown): string | null {
  if (!response || typeof response !== 'object' || !('output' in response) || !Array.isArray(response.output)) return null;
  for (const item of response.output) {
    if (!item || typeof item !== 'object' || !('content' in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && typeof content === 'object' && 'type' in content && content.type === 'output_text' && 'text' in content && typeof content.text === 'string') {
        return content.text;
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OpenAI intelligence is not configured for this deployment.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const prompt = 'prompt' in body && typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 8000) : '';
  const history = 'history' in body ? sanitizeHistory(body.history) : [];
  if (!prompt) return Response.json({ error: 'A task request is required.' }, { status: 400 });

  const input = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    {
      role: 'user' as const,
      content: `Current request:\n${prompt}`,
    },
  ];

  let upstream: Response;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        max_output_tokens: 1800,
        store: false,
        reasoning: { effort: 'medium' },
        instructions: systemInstructions,
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'orbis_orchestrator_analysis',
            strict: true,
            schema: analysisSchema,
          },
        },
      }),
    });
  } catch {
    return Response.json({ error: 'The OpenAI service could not be reached.' }, { status: 502 });
  }

  const responseBody = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return Response.json(
      { error: 'The OpenAI analysis request failed.', upstream_status: upstream.status },
      { status: 502 },
    );
  }

  const text = outputText(responseBody);
  if (!text) return Response.json({ error: 'The OpenAI response did not contain an analysis.' }, { status: 502 });

  try {
    return Response.json({ analysis: JSON.parse(text), model: 'gpt-5.4' });
  } catch {
    return Response.json({ error: 'The OpenAI response could not be parsed.' }, { status: 502 });
  }
}
