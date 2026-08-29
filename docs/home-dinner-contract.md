# Orbis Home Dinner Outcome Contract

This document defines the P0 frontend/backend contract for an outcome that coordinates Warehouse, Delivery, and Home work. It extends the existing `/api/v1` Vision and physical-workflow contract without changing those endpoints.

The canonical demonstration objective is:

> Prepare a vegetarian pasta dinner for 12 by 7:00 PM, prepare the dining area, receive the grocery order, and restore the home after dinner.

## Contract conventions

- Base URL: `http://127.0.0.1:8080`.
- JSON polling is the P0 update mechanism.
- Every mutation contains a non-empty `request_id` and follows the existing idempotency rules.
- Times are UTC ISO 8601 strings. Deadlines include an explicit timezone offset when entered by a user.
- The outcome snapshot is reconstructable after refresh; browser timers and simulated videos never advance work.
- Unknown fields are ignored by clients. Additive fields do not require a v2.
- `SIMULATED EXECUTION` and `SIMULATED FEED` labels are required whenever fixture workers or videos are shown.
- AI output may propose a plan. Deterministic application policy controls purchase approval, dietary constraints, safety gates, routing, custody, and task release.

Errors retain the existing envelope:

```json
{
  "error": {
    "code": "INVALID_ACTION",
    "message": "The requested action is not permitted in the current outcome state.",
    "retryable": false,
    "details": []
  },
  "request_id": "req_123"
}
```

## Endpoints

Existing `/api/v1/workflows`, Vision, workers, and system endpoints remain unchanged.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/outcome-plans` | Convert a user request into a reviewable dinner plan |
| GET | `/api/v1/outcome-plans/{plan_id}` | Retrieve the proposed plan |
| POST | `/api/v1/outcome-plans/{plan_id}/approve` | Approve purchase and create an executable outcome |
| GET | `/api/v1/outcomes/{outcome_id}` | Retrieve the complete UI-reconstructable outcome snapshot |
| POST | `/api/v1/outcomes/{outcome_id}/start` | Start approved Warehouse and Home work |
| POST | `/api/v1/outcomes/{outcome_id}/actions` | Submit a recovery, host, or lifecycle action |
| GET | `/api/v1/outcomes/{outcome_id}/events?after_sequence=N` | Poll monotonic outcome events |
| GET | `/api/v1/home/workers` | List the five Home workers |
| GET | `/api/v1/home/workers/{worker_id}` | Retrieve Home worker detail and reliability |

## Planning and approval

Create a plan:

```json
{
  "request_id": "req_plan_dinner_12",
  "objective": "Prepare a vegetarian pasta dinner for 12 by 7:00 PM and clean up afterward.",
  "scenario": "home_dinner",
  "constraints": {
    "guest_count": 12,
    "meal": "vegetarian pasta",
    "ready_by": "2026-08-29T19:00:00-07:00",
    "dietary": ["vegetarian", "nut_free"],
    "substitutions": "approval_required",
    "cleanup": "after_host_confirmation"
  }
}
```

Approve it:

```json
{
  "request_id": "req_approve_plan_dinner_12",
  "approve_purchase": true,
  "approve_execution": true,
  "high_risk_cooking": "human_approval_required"
}
```

Approval is a hard gate. Inventory reservations, purchases, and physical execution do not begin while the plan is `awaiting_approval`.

`OutcomePlanView` contains:

- identity: `id`, `objective`, `status`, `scenario`
- requested outcome: `meal`, `guest_count`, `ready_by`, dietary and substitution policies
- order proposal: ingredients, quantities, inventory source, price estimate, package estimate
- execution proposal: three lanes, proposed workers, schedule, dependencies, and policies
- readiness and cleanup definitions
- approval requirements and permitted actions
- `created_at` and `updated_at`

Plan statuses are `draft`, `generating`, `awaiting_approval`, `approved`, `rejected`, and `invalid`.

## Outcome snapshot

`GET /api/v1/outcomes/{outcome_id}` returns the authoritative `OutcomeView`:

- identity: `id`, `plan_id`, `title`, `objective`, `scenario`
- lifecycle: `status`, `phase`, `progress_percent`, deadline, predicted completion, and schedule risk
- current context: `current_action`, `current_worker_id`, `next_action`, and `blocked_by`
- coordination: `lanes`, tasks, dependencies, active assignments, and critical path
- resources: `workers`, `order`, `routing`, and `custody`
- trust and recovery: `attention`, `permitted_actions`, `evidence`, and recent `events`
- milestones: `dinner_readiness`, `cleanup`, `created_at`, and `updated_at`

### Outcome statuses

- `draft`
- `awaiting_approval`
- `scheduled`
- `executing`
- `attention_required`
- `blocked`
- `dinner_ready`
- `cleaning_up`
- `completed`
- `cancelled`

### Outcome phases

- `planning`
- `warehouse_fulfillment`
- `home_preparation`
- `delivery`
- `cooking`
- `final_verification`
- `dinner_ready`
- `cleanup`
- `completed`

`status` describes health; `phase` describes where the outcome is. For example, package damage produces `status: attention_required` while `phase: warehouse_fulfillment`.

### Progress

`progress_percent` is a weighted projection over required tasks, expected duration, and critical-path position. It is not an average of worker percentages. Optional tasks do not prevent completion. A task blocked by a dependency contributes no unearned progress.

## Lanes and tasks

Every executable outcome contains exactly three public lanes:

| Lane | P0 responsibilities |
|---|---|
| `warehouse` | Reserve inventory, pick produce/dry/refrigerated goods, consolidate, inspect, pack, stage |
| `delivery` | Evaluate candidates, accept Warehouse custody, transit, arrive, transfer Home custody |
| `home` | Inspect, clean, configure furniture and lighting, stage, receive, cook, verify, clean up |

Each lane includes `id`, `name`, `status`, `progress_percent`, `current_task_id`, `blocked_by`, `predicted_completion`, and ordered `tasks`.

Task states are:

- `queued`
- `ready`
- `reserved`
- `executing`
- `verifying`
- `completed`
- `attention_required`
- `blocked`
- `failed`
- `skipped`
- `cancelled`

Each task includes:

- `id`, `lane_id`, `name`, `capability`, `status`, and `required`
- `assigned_worker_id`, `progress_percent`, and `current_action`
- `depends_on` task IDs and, when waiting, `blocked_by`
- `started_at`, `expected_completion`, and `completed_at`
- `evidence_ids`, `error`, and `permitted_actions`

Unrelated ready tasks continue when one task enters `attention_required` or `blocked`.

## Home worker roster

All five Home workers use the common worker view and public `kind` values. Fixture execution is explicitly labeled.

| Worker ID | Name | Kind | Required capabilities |
|---|---|---|---|
| `home-roomba-01` | Roomba | `robot` | `clean_floor`, `verify_coverage` |
| `home-humanoid-cook-01` | Humanoid Cook | `robot` | `prepare_food`, `cook_meal`, `plate_meal`, `store_leftovers` |
| `home-loader-01` | Loader Robot | `robot` | `clear_surfaces`, `stage_kitchen`, `receive_delivery`, `transport_items`, `clean_surfaces` |
| `home-furniture-01` | Furniture Robot | `robot` | `configure_table`, `position_chairs`, `restore_layout` |
| `home-lamp-agent-01` | Lamp Agent | `ai` | `set_preparation_lighting`, `set_dinner_lighting`, `set_cleanup_lighting`, `restore_lighting` |

Worker views include `id`, `name`, `kind`, `subtype`, `location`, `status`, `health`, `capabilities`, `active_assignment`, `custody_capable`, `execution_mode`, `feed`, and session reliability. Model confidence is never represented as worker reliability.

The Loader Robot is the default Home custody recipient. Vision agents and the Lamp Agent never receive physical custody.

## Order and routing

The order is structured data, not an image inference. `order` contains:

- `id`, `status`, `warehouse_id`, `currency`, and `estimated_total`
- item lines with category, quantity, unit, inventory status, substitutions, and dietary tags
- `manifest` with package count, weight, volume, refrigeration, handling, and evidence IDs
- reservations, substitutions, and reconciliation state

Routing evaluates package facts, destination, availability, deadline, refrigeration, and candidate capabilities. `routing` contains `status`, selected worker, selection reason, candidate records, reservation, ETA, and evidence IDs. Every candidate is visible with `eligible` and explicit `reasons`.

Routing statuses are `pending`, `blocked`, `evaluating`, `selected`, `in_transit`, `arrived`, `handoff_complete`, and `cancelled`.

The P0 dinner-for-12 fixture rejects the small robot for insufficient volume and refrigeration, and selects the large delivery worker. A routing recommendation alone does not transfer custody.

## Custody

`custody.current` names the current custodian for each physical object. `custody.history` is append-only. Each handoff includes:

- `id`, `object_id`, `from_worker_id`, and `to_worker_id`
- `status`: `pending`, `offered`, `accepted`, `rejected`, or `cancelled`
- `manifest_verified`, `evidence_ids`, `occurred_at`, and optional rejection reason

The expected package chain is:

```text
warehouse-control → packing-arm-01 → delivery-large-01 → home-loader-01 → home-humanoid-cook-01
```

The Humanoid Cook's ingredient-dependent work cannot become `ready` until the Loader Robot accepts the delivered manifest.

## Attention and recovery actions

`attention` is nullable. When present it includes:

- `id`, `severity`, `code`, `title`, and plain-language `message`
- affected and continuing task IDs
- `blocking`, deadline impact, evidence IDs, and `raised_at`
- permitted recovery actions

P0 typed actions are:

- `approve_substitution`
- `submit_vision_review`
- `clear_obstruction`
- `approve_layout_change`
- `reassign_worker`
- `assign_human`
- `retry_task`
- `simplify_menu`
- `begin_dinner`
- `keep_warm`
- `report_issue`
- `begin_cleanup`
- `cancel_outcome`

Action request:

```json
{
  "request_id": "req_recovery_001",
  "action": "clear_obstruction",
  "actor_id": "host-demo",
  "target_id": "task_home_furniture",
  "parameters": {"notes": "Movement zone is clear."}
}
```

The response is the updated `OutcomeView`. An action not present in `permitted_actions` returns `409 INVALID_STATE`. Recovery appends evidence and events; it never overwrites the original observation.

## Evidence and events

Evidence is append-only and distinguishes `model_observation`, `policy_decision`, `robot_telemetry`, `human_attestation`, `custody_event`, and `outcome_verification`.

Every evidence entry includes `id`, `type`, `actor_id`, `task_id`, `object_id`, `summary`, `source`, `occurred_at`, and optional `model`, `prompt_version`, `confidence`, `data`, and `supersedes`. Human evidence has nullable confidence.

Outcome events use one globally monotonic sequence and include `id`, `sequence`, `type`, `outcome_id`, `lane_id`, `task_id`, `message`, `data`, `source`, and `occurred_at`. Typical types include:

- `outcome.created`, `plan.approved`, `outcome.started`
- `task.ready`, `worker.reserved`, `task.started`, `task.completed`
- `evidence.recorded`, `policy.blocked`, `human.approved`
- `routing.selected`, `custody.transferred`, `workflow.replanned`
- `outcome.dinner_ready`, `cleanup.started`, `outcome.completed`

Event polling returns:

```json
{"outcome_id":"outcome_dinner_12","after_sequence":18,"events":[],"last_sequence":18}
```

## Dinner readiness and cleanup

`dinner_readiness` contains required checks for meal, twelve place settings, room cleanliness, safe layout, lighting, dietary policy, and order reconciliation. The outcome reaches `dinner_ready` only when every required check passes.

Dinner-ready is a user-visible milestone, not completion. Cleanup begins only after `begin_cleanup` from the host. `cleanup` contains ordered checks for clearing dishes, storing leftovers, cleaning cooking equipment, restoring furniture, cleaning floors, restoring lighting, and final inspection.

The outcome reaches `completed` only after all required cleanup checks pass and final outcome evidence is recorded.

## Representative fixtures

The contract states used by the seven-screen flow are represented in [`tests/fixtures`](../tests/fixtures/):

- `outcome-plan-ready.json`
- `outcome-executing.json`
- `outcome-attention.json`
- `outcome-dinner-ready.json`
- `outcome-cleanup.json`
- `outcome-completed.json`

The New Task screen precedes resource creation and therefore has no server fixture. Plan Review uses `outcome-plan-ready.json`; Live Session, Attention, Dinner Ready, Cleanup, and Completion each use their matching outcome fixture.
