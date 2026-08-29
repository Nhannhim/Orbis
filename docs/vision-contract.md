# Orbis `/api/v1` Contract

This is the authoritative UI/backend contract for the Vision demo. The current UI adapter may normalize snake_case fields for presentation, but new backend integrations should use these names directly.

## Conventions

- Base URL: `http://127.0.0.1:8080`
- JSON polling is the P0 live-update mechanism; `/api/v1/system` returns the recommended interval.
- Every mutation includes a non-empty `request_id`.
- Replaying the same operation, ID, and payload returns the original resource and `Idempotent-Replay: true`.
- Reusing an ID with different content returns `409 IDEMPOTENCY_CONFLICT`.
- Times are UTC ISO 8601 strings. IDs and timestamps in fixtures are illustrative.
- Unknown fields should be ignored by UI consumers. Additive fields do not require a v2.

Errors use:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request did not match the API contract.",
    "retryable": false,
    "details": []
  },
  "request_id": "req_123"
}
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/system` | Mode, model, health, and polling configuration |
| GET | `/api/v1/workers` | Common AI, robot, and human worker views |
| GET | `/api/v1/workers/{worker_id}` | Worker detail and session reliability |
| GET | `/api/v1/vision/scenarios` | Curated demo scenarios and public image URLs |
| POST | `/api/v1/vision/inspections` | Run an inspection for an existing workflow |
| GET | `/api/v1/vision/inspections/{inspection_id}` | Original result, current policy, and review history |
| POST | `/api/v1/vision/inspections/{inspection_id}/reviews` | Append human review and rerun policy |
| POST | `/api/v1/workflows` | Create a Vision-gated physical workflow |
| GET | `/api/v1/workflows/{workflow_id}` | Complete UI-reconstructable snapshot |
| POST | `/api/v1/workflows/{workflow_id}/start` | Run the Vision gate and, only if clear, physical work |
| POST | `/api/v1/workflows/{workflow_id}/retry` | Retry the permitted Vision or physical action |
| GET | `/api/v1/workflows/{workflow_id}/events?after_sequence=N` | Read events after a monotonic cursor |

Legacy unversioned routes remain available for the original physical demo.

## Mutation requests

Create a workflow:

```json
{
  "request_id": "req_create_1042",
  "order_id": "ORD-1042",
  "package_id": "PKG-1042",
  "destination": "Oakland Distribution Center",
  "trailer_id": "truck-17",
  "scenario_id": "damaged",
  "vision_mode": "fixture",
  "auto_start": false
}
```

Start or retry:

```json
{"request_id":"req_start_1042","vision_mode":"fixture"}
```

Review:

```json
{
  "request_id": "req_review_1042",
  "actor_id": "human-inspector-demo",
  "disposition": "repackaged_and_cleared",
  "corrections": {},
  "notes": "Repacked in a new carton and verified the label."
}
```

Allowed dispositions are `corrected`, `repackaged_and_cleared`, `cleared_by_inspector`, and `rejected`. Corrections must contain observation fields. Remediation and inspector clearance require notes. An unavailable provider result cannot be human-reviewed.

## `WorkflowView`

`GET /api/v1/workflows/{id}` is the primary frontend read model. It includes:

- physical identity: `id`, `order_id`, `package_id`, `destination`
- application state: `status`, `phase`, `progress`, `current_worker`, `current_step`, `current_action`
- physical state: `physical_status`, `steps`, `handoffs`
- Vision: `scenario_id`, `inspection_id`, `inspection`, `vision_gate`
- decisions: `routing`, `error`, `permitted_recovery_actions`
- reconstruction: `phases`, latest `events`, `created_at`, `updated_at`

Public phases are `vision_pending`, `vision_analyzing`, `vision_review`, `routing`, `packing`, `warehouse_transport`, `loading`, `delivery_recommended`, and `completed`. Important workflow statuses are `pending`, `inspecting`, `attention_required`, `running`, `completed`, and `cancelled`.

`vision_gate.state` is `pending`, `analyzing`, `review_required`, `cleared`, or `service_unavailable`. `blocks_physical_execution` is the authoritative gate flag.

Representative complete responses live in [`tests/fixtures`](../tests/fixtures/):

- `workflow-normal.json`
- `workflow-damaged-review-required.json`
- `workflow-uncertain-review-required.json`
- `workflow-review-resolved-van.json`
- `workflow-provider-failure.json`

## Inspection

An inspection separates immutable provider output from policy and reviews:

```json
{
  "id": "insp_demo_damaged",
  "status": "review_required",
  "attempt": 1,
  "provider": "fixture",
  "result": {
    "status": "completed",
    "image_url": "/images/vision/package-damaged.png",
    "analysis": {
      "observations": {
        "package_detected": true,
        "package_type": "cardboard_box",
        "size_class": "medium",
        "visible_damage": "severe",
        "damage_indicators": ["crushed_corner"],
        "label_present": true,
        "label_readable": true
      },
      "confidence": {
        "package_type": 0.98,
        "size_class": 0.94,
        "visible_damage": 0.97,
        "label_readable": 0.98,
        "overall": 0.96
      }
    },
    "provenance": {
      "mode": "fixture",
      "model": "fixture-v1",
      "prompt_version": "package-inspection-v1"
    },
    "error": null
  },
  "policy": {
    "decision": "review_required",
    "signals": ["VISIBLE_DAMAGE_REQUIRES_REVIEW"],
    "reasons": ["Visible damage is classified as severe."],
    "advisories": [],
    "effective_observations": {},
    "overrides_applied": {},
    "thresholds": {"critical_field_confidence": 0.8, "overall_confidence": 0.85}
  },
  "reviews": []
}
```

The `result` stays unchanged after review. A review is append-only, and current `policy.effective_observations` reflects the latest accepted overrides.

## Routing

Routing is a simulated recommendation:

```json
{
  "status": "selected",
  "worker_id": "delivery-van-07",
  "recommended_worker_id": "delivery-van-07",
  "worker_type": "van",
  "mode": "van",
  "reason": "A repackaged damaged parcel is assigned to the delivery van.",
  "candidates": [
    {"worker_id":"delivery-robot-01","worker_type":"robot","eligible":false,"reason":"This worker does not match the verified package condition."},
    {"worker_id":"delivery-van-07","worker_type":"van","eligible":true,"reason":"A repackaged damaged parcel is assigned to the delivery van."}
  ]
}
```

Until policy clears, `status` is `blocked`, both candidates are ineligible, and `worker_id` is null. A recommendation does not reserve a worker or transfer custody.

## Workers and reliability

All workers expose `id`, `name`, `kind` (`ai`, `robot`, or `human`), subtype/agent type, location, status, capabilities, active assignment, `custody_capable`, and session reliability. Common reliability fields are `attempts`, `completions`, `failures`, `interventions`, `success_rate`, and `intervention_rate`. Vision may additionally expose `provider_failure_rate` and `correction_rate`. Model confidence is never used as operational reliability.

## Events

Every event contains `id`, globally monotonic `sequence`, `type`, `workflow_id`, `message`, `data`, `source`, and `occurred_at`. Event polling returns:

```json
{"workflow_id":"wf_demo","after_sequence":12,"events":[],"last_sequence":12}
```

Clients persist `last_sequence` and request only later events. Workflow snapshots still include recent events for refresh reconstruction.
