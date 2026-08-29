# Orbis Physical Agent Protocol — draft 0.1

Orbis coordinates objectives and custody across autonomous machines. It does not
replace a machine's real-time controller, safety PLC, navigation stack, or
emergency-stop system.

## Agent contract

Every edge adapter must expose five behaviors:

1. **Describe** — advertise identity, health, capabilities, constraints, and
   location.
2. **Reserve** — accept a time-bounded claim on a capability and the required
   physical resources.
3. **Accept custody** — acknowledge an object using the previous agent's signed
   evidence bundle.
4. **Execute** — pursue a goal locally while reporting state transitions.
5. **Prove** — return observations that demonstrate the expected physical
   outcome or explicitly report that it could not be verified.

A production adapter should also implement heartbeat, cancellation,
compensation, lease expiry, and an independently controlled emergency stop.

## Capability descriptor

```json
{
  "agent_id": "loading-station-01",
  "type": "robotic_loader",
  "status": "available",
  "location": "dock_4",
  "capabilities": [
    {
      "name": "load_vehicle",
      "description": "Load and visually verify cargo",
      "constraints": { "dock": 4, "max_kg": 35 }
    }
  ]
}
```

Capability names describe outcomes, not vendor-specific actuator commands.

## Task envelope

```json
{
  "id": "step_8f6cde0123",
  "workflow_id": "wf_374f19b213",
  "object_id": "PKG-1042",
  "capability": "load_vehicle",
  "payload": { "trailer_id": "truck-17" },
  "preconditions": [
    "previous_step.verified",
    "handoff.accepted",
    "vehicle.identity_verified"
  ],
  "policy": {
    "minimum_confidence": 0.9,
    "lease_seconds": 60,
    "human_approval": false
  }
}
```

## Evidence envelope

```json
{
  "id": "ev_c51d8fc9932a",
  "producer_id": "loading-station-01",
  "kind": "vision_and_load_verification",
  "passed": true,
  "confidence": 0.98,
  "observations": {
    "object_id": "PKG-1042",
    "vehicle_identity_match": true,
    "inside_cargo_area": true,
    "restraint_check": "passed",
    "trailer_id": "truck-17"
  },
  "captured_at": "2026-08-29T19:00:00+00:00"
}
```

Production evidence should include hashes or references to original sensor
artifacts, model and calibration versions, device signatures, retention rules,
and policy decisions. Confidence alone must never override a hard safety rule.

## Handoff envelope

```json
{
  "id": "ho_c0ad732ee1",
  "object_id": "PKG-1042",
  "from_agent_id": "amr-01",
  "to_agent_id": "loading-station-01",
  "from_step_id": "step_previous",
  "to_step_id": "step_next",
  "evidence_ids": ["ev_c51d8fc9932a"],
  "status": "accepted"
}
```

Custody changes only after the recipient accepts the offered object and its
evidence bundle. Every state change increments the object's world-model version.

## Workflow state machine

```text
pending → reserved → executing → verifying → completed
                                      └────→ failed → retry / compensate / escalate
```

The reference implementation uses an in-memory event log. A production system
should persist append-only events, enforce idempotency keys, use resource leases,
and reconcile the digital twin against fresh sensor observations after network
partitions.

