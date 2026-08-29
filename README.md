# Orbis

Orbis is a proof-grounded orchestration layer for physical AI. This first
vertical slice coordinates a packing arm, an autonomous mobile robot, and a
vehicle loading station through a complete warehouse fulfillment workflow.

The prototype demonstrates:

- capability-based agent selection;
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

## Test it

```bash
python3 -m unittest discover -s tests -v
```

## API

- `GET /api/health` — service health
- `GET /api/state` — agents, packages, workflows, evidence, and events
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

See [the protocol draft](docs/physical-agent-protocol.md) and
[architecture notes](docs/architecture.md) for the boundary between Orbis and
machine-local control.

