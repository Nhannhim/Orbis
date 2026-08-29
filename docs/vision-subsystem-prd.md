# Orbis Vision Subsystem PRD

## Product claim

Orbis Vision converts physical observations into structured, auditable evidence that Orbis can use to coordinate AI agents, robots, and people without asking a probabilistic model to make safety or dispatch decisions.

## Problem

Software for physical work usually coordinates people and assets from administrative records. It does not reliably capture what is happening to the object itself, nor can it safely coordinate AI, human, and robotic workers from the same evidence. The Orbis prototype must prove a narrower wedge: observe a package, gate unsafe work, request human help when needed, recommend the appropriate next-mile worker, and preserve what every worker observed or changed.

## Users and jobs

- A warehouse operator runs an objective and resolves exceptions without leaving the workflow.
- An operations manager understands why work proceeded or stopped, who intervened, and what evidence supports the outcome.
- An integrator consumes stable inspection, worker, routing, workflow, and event contracts.
- A demo viewer sees AI, human, and robotic work coordinated from one source of truth.

## Locked MVP journey

The primary 75–90 second story uses the **Damaged package** scenario:

1. The operator opens `/app/demo`, selects the scenario, and runs the objective.
2. Orbis creates the workflow but keeps physical execution pending.
3. Package Vision 01 records structured observations and model-reported confidence.
4. Application policy—not the model—returns `review_required` and blocks both routing candidates.
5. Orbis requests a Human Inspector. The operator selects `Repackaged and cleared` and records a note.
6. The review is appended; the original model evidence is unchanged.
7. Policy clears the gate. Simulated routing recommends Delivery Van 07 for attended handling and retains Delivery Robot 01 with a rejection reason.
8. The existing packing arm, AMR, and loading station execute with normal custody handoffs.
9. The final view shows the model observation, human remediation, routing rationale, physical evidence, custody chain, and outcome.

Supporting stories:

- **Normal:** clears automatically and recommends Delivery Robot 01.
- **Uncertain:** stays blocked until a human corrects the uncertain observations.
- **Provider failure:** assigns nobody; retry repeats Vision only, or the operator explicitly chooses labeled fixture mode.

## Scope

### Vision owns

- Curated simulated camera scenarios and image provenance
- Package presence, broad type, coarse size, visible damage, damage indicators, label presence/readability
- Per-field and overall model-reported confidence
- A versioned, schema-constrained observation envelope
- Inputs to deterministic policy
- Immutable model evidence and operational reliability counters

### Coordinator owns

- The Vision gate and permitted recovery actions
- Human-review records and effective observation overrides
- Policy evaluation and routing recommendation
- Unified worker views, workflow snapshots, and monotonic event history
- Releasing the existing physical workflow only after clearance

### Vision does not own

- Physical custody, worker reservation, or machine-local control
- Exact dimensions, weight, hazardous-material status, or destination facts inferred from an image
- Robot capacity/health, driver availability, route planning, or final dispatch
- A fabricated aggregate reliability score

### P0

- Normal, damaged, uncertain, and provider-failure stories
- OpenAI live mode plus an explicit, visibly labeled fixture mode
- Human correction, remediation, clearance, and rejection
- Simulated robot/van routing with selected and rejected reasons
- Polling-based UI reconstruction after refresh
- In-memory, session-local evidence, workflows, idempotency records, and events

### Deferred

- Arbitrary image upload, continuous video, and calibrated confidence
- Authentication, persistent storage, production permissions, and retention controls
- SSE, real dispatch, route optimization, robot/vehicle integrations, and automated learning from corrections

## Product and safety rules

- Vision and the inspector are observe-only workers and never receive custody.
- No unresolved package is released to physical execution or next-mile routing.
- The model produces observations only. Deterministic code applies thresholds and policy.
- A provider or schema failure fails closed. Live mode never silently falls back to fixtures.
- Corrected values affect policy but never overwrite the original model value or confidence.
- Human attestations have no manufactured confidence value.
- `repackaged_and_cleared` and `cleared_by_inspector` require notes; `rejected` cancels the workflow.
- Robot/van results are labeled `SIMULATED ROUTING`; they are recommendations, not reservations or dispatch.
- Routing uses package manifest, destination, fleet, and remediation facts rather than image-derived guesses.

## Policy

The gate requires review for a missing package, visible or uncertain damage, a missing/unreadable label, any critical-field confidence below `0.80`, or overall confidence below `0.85`. A large package emits an advisory but does not by itself block. Provider failure creates `service_unavailable` and permits Vision retry only.

## Success measures

- All three visible stories work from UI selection through backend outcome without editing code.
- The damaged-package hero story completes in under 90 seconds.
- A blocked or unavailable inspection never causes physical dispatch.
- Each selected and rejected routing candidate has an explicit reason.
- Original model evidence and human evidence remain separately visible.
- Refresh reconstructs the active workflow; browser timers cannot advance it.
- Live and fixture modes are unmistakable.
- Existing physical evidence, retries, and custody behavior remain unchanged.
- The browser never receives a provider credential.
- A non-developer can start and rehearse the demo from the runbook.

## Learning story

The MVP produces the raw material for learning without automatically training on it: scenario and image provenance, prompt/model versions, original observations and confidence, policy signals, human overrides or remediation, selected/rejected candidates, physical evidence, and final outcome. A later system can measure corrections, provider failures, interventions, and operational success while preserving the distinction between model confidence and real-world reliability.
