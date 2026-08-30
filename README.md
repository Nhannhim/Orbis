# Orbis

Orbis is a proof-grounded orchestration layer for physical AI. It turns a
requested physical outcome into a guarded delegation plan, then coordinates
qualified warehouse, delivery, and home robots through the resulting workflow.

The prototype demonstrates:

- capability-based agent selection;
- prompt-to-outcome analysis and scenario selection;
- dependency-aware parallel execution waves;
- explicit delegation rationale and policy decisions;
- resource reservation and local execution;
- visual/sensor evidence validation;
- explicit custody handoffs between machines;
- a versioned package world model;
- an append-only audit trail; and
- failure containment and operator-triggered recovery.

## Run it

The prototype has no third-party runtime dependencies and works with Python
3.9 or newer.

```bash
python3 run.py
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080), then select **Run
fulfillment**. Enable the failure checkbox to see the loading station reject its
own visual evidence and place the workflow into `attention_required`; retrying
the step completes the chain.

To use the installable command instead:

```bash
python3 -m pip install -e .
orbis
```

Configuration:

```bash
ORBIS_HOST=127.0.0.1 ORBIS_PORT=8080 python3 run.py
```

## Product AI

The hosted workspace in `site/` uses the OpenAI Responses API to create the
user-visible analysis, select a supported scenario, and propose robot
delegations. The browser calls Orbis's own `/api/orchestrate` route; the OpenAI
key remains server-side and requests use `store: false`.

For local development, copy `site/.env.example` to `site/.env.local`, set
`OPENAI_API_KEY`, then run the site normally. For production, add the same key
as a secret runtime environment variable in the Sites deployment rather than
committing it to the repository.

## Test it

```bash
python3 -m unittest discover -s tests -v
```

## API

- `GET /api/health` — service health
- `GET /api/state` — agents, packages, workflows, evidence, and events
- `GET /api/scenarios` — supported home simulation scenario families
- `POST /api/plans` — analyze an outcome and compile a guarded delegation plan
- `GET /api/workflows/{id}` — one workflow
- `POST /api/workflows` — create and optionally start a warehouse workflow
- `POST /api/workflows/{id}/start` — start a pending workflow
- `POST /api/workflows/{id}/retry` — retry the failed current step

Example:

```bash
curl -X POST http://127.0.0.1:8080/api/workflows \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id":"ORD-1042",
    "package_id":"PKG-1042",
    "destination":"Oakland Distribution Center",
    "fail_at":"loading",
    "auto_start":true
  }'
```

Compile a home orchestration plan:

```bash
curl -X POST http://127.0.0.1:8080/api/plans \
  -H 'Content-Type: application/json' \
  -d '{
    "environment":"home",
    "objective":"Buy groceries for dinner for 12 under $250, deliver them, clean the house, arrange the furniture, and set warm lighting."
  }'
```

See [the protocol draft](docs/physical-agent-protocol.md) and
[architecture notes](docs/architecture.md) for the boundary between Orbis and
machine-local control.
