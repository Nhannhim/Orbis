# Orbis

Orbis is a proof-grounded operating layer for physical AI. Its demos coordinate
AI observers, human reviewers, warehouse machines, delivery workers, and Home
robots through auditable outcome workflows.

The prototype demonstrates:

- structured package perception with live OpenAI or explicit fixture mode;
- deterministic safety policy and human review;
- simulated robot/van routing with rejection reasons;
- capability-based agent selection;
- resource reservation and local execution;
- visual/sensor evidence validation;
- explicit custody handoffs between machines;
- a versioned package world model;
- an append-only audit trail; and
- failure containment and operator-triggered recovery.

The Home dinner story adds a dependency-aware three-lane workflow: specialized
warehouse picking and package handling, capacity-aware delivery, and five Home
workers preparing dinner for twelve through host-triggered cleanup.

## Install

Python 3.9+ and Node.js are required.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
cd site && npm install && cd ..
```

## Run the Vision demo

Use explicit fixture mode for a deterministic rehearsal:

```bash
ORBIS_VISION_MODE=fixture ./scripts/run-demo
```

Open [http://localhost:3000/app/demo](http://localhost:3000/app/demo). The API
reference is at [http://127.0.0.1:8080/api/docs](http://127.0.0.1:8080/api/docs).

For live package analysis, copy `.env.example` to the ignored `.env.local`, add
the server-side key, then run:

```bash
ORBIS_VISION_MODE=openai ./scripts/run-demo
```

Live mode never silently falls back to fixtures. Never expose
`OPENAI_API_KEY` through a `NEXT_PUBLIC_` variable.

The original physical console remains available at
[http://127.0.0.1:8080](http://127.0.0.1:8080) when the backend runs alone.

## Test it

```bash
.venv/bin/python -m unittest discover -s tests -v
cd site && npm run build
```

## API

- `GET /api/v1/system` — mode, model, and polling configuration
- `GET /api/v1/workers` — unified AI, robot, and human worker views
- `GET /api/v1/vision/scenarios` — curated package feeds
- `POST /api/v1/vision/inspections` — structured package inspection
- `POST /api/v1/vision/inspections/{id}/reviews` — append human review
- `POST /api/v1/workflows` — create a Vision-gated workflow
- `GET /api/v1/workflows/{id}` — complete frontend snapshot
- `POST /api/v1/workflows/{id}/start` — inspect and conditionally release work
- `POST /api/v1/workflows/{id}/retry` — retry the permitted recovery action
- `GET /api/v1/workflows/{id}/events` — poll monotonic events
- `POST /api/v1/outcome-plans` — create a reviewable Home dinner plan
- `POST /api/v1/outcome-plans/{id}/approve` — approve purchase and execution
- `POST /api/v1/outcomes/{id}/start` — start Warehouse and Home work in parallel
- `GET /api/v1/outcomes/{id}` — complete three-lane outcome snapshot
- `POST /api/v1/outcomes/{id}/actions` — review, recovery, and cleanup actions
- `GET /api/v1/outcomes/{id}/events` — poll monotonic outcome events
- `GET /api/v1/home/workers` — the five simulated Home workers

Example:

```bash
curl -X POST http://127.0.0.1:8080/api/v1/workflows \
  -H 'Content-Type: application/json' \
  -d '{
    "request_id":"req-create-1042",
    "order_id":"ORD-1042",
    "package_id":"PKG-1042",
    "destination":"Oakland Distribution Center",
    "scenario_id":"damaged",
    "vision_mode":"fixture"
  }'
```

See the [Vision PRD](docs/vision-subsystem-prd.md), [v1 contract](docs/vision-contract.md),
[Home dinner contract](docs/home-dinner-contract.md),
[demo runbook](docs/demo-runbook.md), [protocol draft](docs/physical-agent-protocol.md),
and [architecture notes](docs/architecture.md).
