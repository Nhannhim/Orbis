"""Application coordinator for inspection-gated Orbis workflows.

The physical :class:`~orbis.engine.Orchestrator` remains the authority for
machine execution and custody.  This module adds the application-facing
inspection, review, routing, event, and idempotency concerns without making a
vision service or a reviewer a physical custodian.
"""

from copy import deepcopy
from dataclasses import dataclass, field
from functools import wraps
import hashlib
import json
from threading import RLock
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple
from uuid import uuid4

from .engine import OrchestrationError, Orchestrator, create_demo_orchestrator
from .models import WorkflowStatus, utc_now

try:  # The coordinator can still be imported while an optional provider is absent.
    from .vision import FixtureVisionProvider, VisionProvider, evaluate_policy
except ModuleNotFoundError as exc:  # pragma: no cover - exercised only in partial installs
    if exc.name != "orbis.vision":
        raise
    FixtureVisionProvider = None  # type: ignore[assignment,misc]
    VisionProvider = Any  # type: ignore[assignment,misc]

    def evaluate_policy(inspection: Mapping[str, Any], overrides: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        observations = dict((inspection.get("analysis") or {}).get("observations") or {})
        observations.update(dict(overrides or {}))
        condition = _condition_from_observations(observations)
        clear = condition == "normal"
        return {
            "decision": "clear" if clear else "review_required",
            "service_status": "available",
            "signals": [] if clear else ["REVIEW_REQUIRED"],
            "reasons": [] if clear else ["Inspection requires review."],
            "advisories": [],
            "effective_observations": observations,
            "overrides_applied": dict(overrides or {}),
        }


class CoordinatorError(RuntimeError):
    """A stable application error suitable for translation by an HTTP layer."""

    def __init__(self, message: str, code: str = "COORDINATOR_ERROR", status_code: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _serialized_mutation(method: Callable[..., Dict[str, Any]]) -> Callable[..., Dict[str, Any]]:
    """Serialize state-changing calls so idempotency remains atomic."""

    @wraps(method)
    def wrapped(self: "Coordinator", *args: Any, **kwargs: Any) -> Dict[str, Any]:
        with self._mutation_lock:
            return method(self, *args, **kwargs)

    return wrapped


@dataclass
class _WorkflowRecord:
    scenario_id: str
    status: str = "pending"
    phase: str = "vision"
    inspection_id: Optional[str] = None
    route: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
    physical_started: bool = False
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)


@dataclass
class _InspectionRecord:
    id: str
    scenario_id: str
    workflow_id: str
    object_id: str
    status: str = "pending"
    attempt: int = 0
    provider: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    policy: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
    reviews: List[Dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)


@dataclass(frozen=True)
class _IdempotencyEntry:
    fingerprint: str
    resource_type: str
    resource_id: str


SCENARIOS: Tuple[Dict[str, Any], ...] = (
    {
        "id": "normal",
        "name": "Normal package",
        "description": "Package is present, intact, and readable.",
        "expected_outcome": "robot",
    },
    {
        "id": "damaged",
        "name": "Damaged package",
        "description": "Damage must be reviewed and repackaged before dispatch.",
        "expected_outcome": "van_after_repackaging",
    },
    {
        "id": "uncertain",
        "name": "Uncertain package",
        "description": "Low-confidence or incomplete evidence blocks dispatch.",
        "expected_outcome": "blocked",
    },
    {
        "id": "provider-failure",
        "name": "Vision provider failure",
        "description": "A retryable provider outage fails closed without dispatch.",
        "expected_outcome": "retryable_failure",
        "hidden": True,
        "internal": True,
    },
)


DELIVERY_WORKERS: Tuple[Dict[str, Any], ...] = (
    {
        "id": "delivery-robot-01",
        "name": "Delivery Robot 01",
        "worker_type": "robot",
        "agent_type": "delivery_robot",
        "location": "outbound_staging",
        "capabilities": ["last_mile_delivery", "standard_package"],
    },
    {
        "id": "delivery-van-07",
        "name": "Delivery Van 07",
        "worker_type": "van",
        "agent_type": "delivery_van",
        "location": "dock_4",
        "capabilities": ["last_mile_delivery", "remediated_package"],
    },
)


def _condition_from_observations(observations: Mapping[str, Any]) -> str:
    explicit = observations.get("condition") or observations.get("package_condition")
    if explicit:
        value = str(explicit).strip().lower()
        if value in {"normal", "clear", "intact", "undamaged"}:
            return "normal"
        if value in {"damaged", "damage", "repackaged"}:
            return "damaged"
        if value in {"uncertain", "unknown", "inconclusive"}:
            return "uncertain"
    if observations.get("damage_detected") is True or observations.get("damaged") is True:
        return "damaged"
    visible_damage = str(observations.get("visible_damage") or "").lower()
    if visible_damage in {"minor", "severe"}:
        return "damaged"
    if visible_damage == "uncertain":
        return "uncertain"
    if observations.get("package_present") is False or observations.get("label_readable") is False:
        return "uncertain"
    return "normal"


class Coordinator:
    """Coordinate vision gates and application state around a physical engine."""

    def __init__(
        self,
        orchestrator: Optional[Orchestrator] = None,
        vision_provider: Optional[VisionProvider] = None,
        *,
        vision_providers: Optional[Mapping[str, VisionProvider]] = None,
        policy_evaluator: Optional[Callable[..., Dict[str, Any]]] = None,
        background_execution: bool = True,
    ) -> None:
        self.orchestrator = orchestrator or create_demo_orchestrator()
        if vision_provider is None:
            if FixtureVisionProvider is None:
                raise CoordinatorError(
                    "No vision provider is installed.", "VISION_PROVIDER_MISSING", 503
                )
            vision_provider = FixtureVisionProvider()
        self.vision_provider = vision_provider
        self.vision_providers: Dict[str, VisionProvider] = dict(vision_providers or {})
        self.vision_providers.setdefault("default", vision_provider)
        provider_mode = str(getattr(vision_provider, "mode", "fixture")).lower()
        self.vision_providers.setdefault(provider_mode, vision_provider)
        self.policy_evaluator = policy_evaluator or evaluate_policy
        self.background_execution = background_execution

        self._workflows: Dict[str, _WorkflowRecord] = {}
        self._inspections: Dict[str, _InspectionRecord] = {}
        self._events: List[Dict[str, Any]] = []
        self._event_sequence = 0
        self._engine_event_cursors: Dict[str, int] = {}
        self._idempotency: Dict[Tuple[str, str], _IdempotencyEntry] = {}
        self._idempotency_replays: Dict[Tuple[str, str], bool] = {}
        self._lock = RLock()
        self._mutation_lock = RLock()

    # -- Endpoint-friendly workflow methods ---------------------------------

    @_serialized_mutation
    def create_workflow(
        self, payload: Mapping[str, Any], request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        body = dict(payload)
        scenario_id = str(body.get("scenario_id") or body.get("scenario") or "normal").lower()
        if scenario_id not in {item["id"] for item in SCENARIOS}:
            raise CoordinatorError(
                f"Unknown scenario: {scenario_id}", "UNKNOWN_SCENARIO", 400
            )
        fingerprint = self._fingerprint(body)
        replay = self._replay("create_workflow", request_id, fingerprint)
        if replay:
            return self.get_workflow(replay.resource_id)

        order_id = str(body.get("order_id") or "").strip()
        package_id = str(body.get("package_id") or body.get("object_id") or "").strip()
        destination = str(body.get("destination") or "").strip()
        trailer_id = str(body.get("trailer_id") or "truck-17").strip()
        try:
            workflow = self.orchestrator.create_warehouse_workflow(
                order_id=order_id,
                package_id=package_id,
                destination=destination,
                trailer_id=trailer_id,
            )
        except OrchestrationError as exc:
            raise CoordinatorError(str(exc), "INVALID_WORKFLOW", 409) from exc

        with self._lock:
            self._workflows[workflow.id] = _WorkflowRecord(scenario_id=scenario_id)
            self._engine_event_cursors[workflow.id] = 0
            self._sync_engine_events_locked(workflow.id)
            self._append_event_locked(
                workflow.id,
                "vision.queued",
                "Package is queued for a vision safety check",
                {"scenario_id": scenario_id, "object_id": workflow.package_id},
                "coordinator",
            )
            self._remember(
                "create_workflow", request_id, fingerprint, "workflow", workflow.id
            )

        if bool(body.get("auto_start", False)):
            start_request_id = f"{request_id}:start" if request_id else None
            return self.start_workflow(workflow.id, start_request_id, body.get("vision_mode"))
        return self.get_workflow(workflow.id)

    def get_workflow(self, workflow_id: str) -> Dict[str, Any]:
        with self._lock:
            record = self._record(workflow_id)
            self._sync_engine_events_locked(workflow_id)
            self._refresh_from_engine_locked(workflow_id, record)
            physical = self.orchestrator.workflow_snapshot(workflow_id)
            inspection = (
                self._inspection_view_locked(self._inspections[record.inspection_id])
                if record.inspection_id
                else None
            )
            unified_events = [
                deepcopy(item) for item in self._events if item["workflow_id"] == workflow_id
            ][-50:]
            return self._workflow_view_locked(record, physical, inspection, unified_events)

    @_serialized_mutation
    def start_workflow(
        self,
        workflow_id: str,
        request_id: Optional[str] = None,
        vision_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        fingerprint = self._fingerprint(
            {"workflow_id": workflow_id, "vision_mode": vision_mode or "default"}
        )
        replay = self._replay("start_workflow", request_id, fingerprint)
        if replay:
            return self.get_workflow(replay.resource_id)

        with self._lock:
            record = self._record(workflow_id)
            self._refresh_from_engine_locked(workflow_id, record)
            if record.physical_started:
                raise CoordinatorError(
                    "Physical execution has already started.", "WORKFLOW_ALREADY_STARTED", 409
                )
            if record.status not in {"pending", "attention_required"}:
                raise CoordinatorError(
                    f"Workflow cannot start from {record.status}.",
                    "INVALID_WORKFLOW_STATE",
                    409,
                )
            existing = self._current_inspection_locked(record)
            run_existing = False
            if existing and existing.error and existing.error.get("retryable"):
                inspection_id = existing.id
                run_existing = True
            elif existing and self._policy_decision(existing.policy) != "clear":
                raise CoordinatorError(
                    "This workflow requires review before it can start.",
                    "REVIEW_REQUIRED",
                    409,
                )
            elif existing:
                inspection_id = existing.id
            else:
                inspection_id = None

        if inspection_id and run_existing:
            self._run_inspection(inspection_id, vision_mode)
        elif inspection_id is None:
            inspection = self.create_inspection(
                {
                    "workflow_id": workflow_id,
                    "object_id": self.orchestrator.workflow_snapshot(workflow_id)["package_id"],
                    "scenario_id": self._workflows[workflow_id].scenario_id,
                    "vision_mode": vision_mode,
                },
                None,
            )
            inspection_id = inspection["id"]

        with self._lock:
            inspection_record = self._inspection(inspection_id)
            decision = self._policy_decision(inspection_record.policy)
            self._remember(
                "start_workflow", request_id, fingerprint, "workflow", workflow_id
            )

        if decision == "clear":
            self._route_and_dispatch(workflow_id)
        return self.get_workflow(workflow_id)

    @_serialized_mutation
    def retry_workflow(
        self,
        workflow_id: str,
        request_id: Optional[str] = None,
        vision_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        fingerprint = self._fingerprint(
            {"workflow_id": workflow_id, "vision_mode": vision_mode or "default"}
        )
        replay = self._replay("retry_workflow", request_id, fingerprint)
        if replay:
            return self.get_workflow(replay.resource_id)

        with self._lock:
            record = self._record(workflow_id)
            self._sync_engine_events_locked(workflow_id)
            self._refresh_from_engine_locked(workflow_id, record)
            inspection = self._current_inspection_locked(record)
            retry_vision = bool(
                not record.physical_started
                and inspection
                and inspection.error
                and inspection.error.get("retryable", False)
            )
            physical_status = self.orchestrator.workflow_snapshot(workflow_id)["status"]
            retry_dispatch = bool(
                record.physical_started
                and physical_status == WorkflowStatus.PENDING.value
                and (record.error or {}).get("code") == "PHYSICAL_DISPATCH_FAILED"
                and (record.error or {}).get("retryable", False)
            )

        if retry_vision and inspection:
            self._run_inspection(inspection.id, vision_mode)
            with self._lock:
                cleared = self._policy_decision(inspection.policy) == "clear"
            if cleared:
                self._route_and_dispatch(workflow_id)
        elif physical_status == WorkflowStatus.ATTENTION_REQUIRED.value:
            try:
                self.orchestrator.retry(workflow_id)
            except OrchestrationError as exc:
                raise CoordinatorError(str(exc), "PHYSICAL_RETRY_REJECTED", 409) from exc
            with self._lock:
                record = self._record(workflow_id)
                record.status = "running"
                record.phase = "physical_execution"
                record.error = None
                record.updated_at = utc_now()
        elif retry_dispatch:
            with self._lock:
                record = self._record(workflow_id)
                record.physical_started = False
                record.error = None
            self._route_and_dispatch(workflow_id)
        else:
            raise CoordinatorError(
                "Workflow has no retryable failure.", "WORKFLOW_NOT_RETRYABLE", 409
            )

        with self._lock:
            self._remember(
                "retry_workflow", request_id, fingerprint, "workflow", workflow_id
            )
        return self.get_workflow(workflow_id)

    # -- Inspection and review ---------------------------------------------

    @_serialized_mutation
    def create_inspection(
        self,
        payload: Optional[Mapping[str, Any]] = None,
        request_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        body = dict(payload or {})
        body.update(kwargs)
        workflow_id = str(body.get("workflow_id") or "")
        with self._lock:
            workflow_record = self._record(workflow_id)
            physical = self.orchestrator.workflow_snapshot(workflow_id)
            object_id = str(body.get("object_id") or physical["package_id"])
            scenario_id = str(body.get("scenario_id") or workflow_record.scenario_id).lower()
            if scenario_id not in {item["id"] for item in SCENARIOS}:
                raise CoordinatorError(
                    f"Unknown scenario: {scenario_id}", "UNKNOWN_SCENARIO", 400
                )
            if object_id != physical["package_id"]:
                raise CoordinatorError(
                    "Inspection object does not match the workflow package.",
                    "OBJECT_MISMATCH",
                    409,
                )
        # Validate the requested mode before registering a running inspection.
        self._provider(body.get("vision_mode"))

        canonical = {
            "workflow_id": workflow_id,
            "object_id": object_id,
            "scenario_id": scenario_id,
            "vision_mode": body.get("vision_mode") or "default",
        }
        fingerprint = self._fingerprint(canonical)
        replay = self._replay("create_inspection", request_id, fingerprint)
        if replay:
            return self.get_inspection(replay.resource_id)

        inspection_id = f"insp_{uuid4().hex[:12]}"
        inspection = _InspectionRecord(
            id=inspection_id,
            scenario_id=scenario_id,
            workflow_id=workflow_id,
            object_id=object_id,
        )
        with self._lock:
            record = self._record(workflow_id)
            if record.physical_started:
                raise CoordinatorError(
                    "Inspection cannot replace evidence after physical execution starts.",
                    "PHYSICAL_EXECUTION_STARTED",
                    409,
                )
            self._inspections[inspection_id] = inspection
            record.inspection_id = inspection_id
            record.status = "inspecting"
            record.phase = "vision"
            record.error = None
            record.updated_at = utc_now()
            self._remember(
                "create_inspection", request_id, fingerprint, "inspection", inspection_id
            )

        self._run_inspection(inspection_id, body.get("vision_mode"))
        return self.get_inspection(inspection_id)

    def get_inspection(self, inspection_id: str) -> Dict[str, Any]:
        with self._lock:
            return self._inspection_view_locked(self._inspection(inspection_id))

    @_serialized_mutation
    def review_inspection(
        self,
        inspection_id: str,
        payload: Optional[Mapping[str, Any]] = None,
        request_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        body = dict(payload or {})
        body.update(kwargs)
        fingerprint = self._fingerprint({"inspection_id": inspection_id, "review": body})
        replay = self._replay("review_inspection", request_id, fingerprint)
        if replay:
            return self.get_inspection(replay.resource_id)

        with self._lock:
            inspection = self._inspection(inspection_id)
            if inspection.result is None:
                raise CoordinatorError(
                    "An unavailable inspection cannot be reviewed.",
                    "INSPECTION_UNAVAILABLE",
                    409,
                )
            if inspection.reviews:
                raise CoordinatorError(
                    "This inspection already has a review disposition.",
                    "REVIEW_CONFLICT",
                    409,
                )
            if self._policy_decision(inspection.policy) == "clear":
                raise CoordinatorError(
                    "This inspection is already clear.",
                    "INSPECTION_ALREADY_CLEARED",
                    409,
                )
            resolution = str(
                body.get("resolution") or body.get("decision") or body.get("action") or ""
            ).strip().lower().replace(" ", "_")
            if not resolution:
                raise CoordinatorError("Review resolution is required.", "INVALID_REVIEW", 400)
            reviewer_id = str(body.get("reviewer_id") or "human-inspector-demo")
            notes = str(body.get("notes") or "").strip()
            if resolution in {
                "repackaged",
                "repackaged_and_cleared",
                "repackaged_cleared",
                "cleared_by_inspector",
                "inspector_override",
            } and not notes:
                raise CoordinatorError(
                    "Review notes are required for remediation or inspector clearance.",
                    "REVIEW_NOTES_REQUIRED",
                    400,
                )
            overrides = self._review_overrides(inspection, resolution, body)

        try:
            revised_policy = self.policy_evaluator(deepcopy(inspection.result), overrides=overrides)
        except Exception as exc:
            raise CoordinatorError(
                f"Review policy evaluation failed: {exc}", "POLICY_EVALUATION_FAILED", 500
            ) from exc
        revised_policy = deepcopy(dict(revised_policy))

        review = {
            "id": f"review_{uuid4().hex[:12]}",
            "inspection_id": inspection_id,
            "workflow_id": inspection.workflow_id,
            "reviewer_id": reviewer_id,
            "resolution": resolution,
            "notes": notes,
            "overrides": deepcopy(overrides),
            "policy": revised_policy,
            "created_at": utc_now(),
        }
        with self._lock:
            inspection = self._inspection(inspection_id)
            inspection.reviews.append(review)
            inspection.policy = revised_policy
            rejected = resolution in {"rejected", "blocked", "deny", "denied"}
            inspection.status = "rejected" if rejected else (
                "cleared" if self._policy_decision(revised_policy) == "clear" else "review_required"
            )
            inspection.updated_at = utc_now()
            record = self._record(inspection.workflow_id)
            record.error = None
            if rejected:
                record.status = "cancelled"
                record.phase = "review"
                record.route = self._blocked_route("A human inspector rejected the package.")
                record.error = {
                    "code": "INSPECTION_REJECTED",
                    "message": "A human inspector rejected the package.",
                    "retryable": False,
                }
            elif self._policy_decision(revised_policy) == "clear":
                record.status = "routing"
                record.phase = "routing"
            else:
                record.status = "attention_required"
                record.phase = "review"
                record.error = self._policy_error(revised_policy)
            record.updated_at = utc_now()
            self._append_event_locked(
                inspection.workflow_id,
                "inspection.reviewed",
                "A human review was appended to the inspection evidence",
                {
                    "inspection_id": inspection.id,
                    "review_id": review["id"],
                    "reviewer_id": reviewer_id,
                    "resolution": resolution,
                    "decision": self._policy_decision(revised_policy),
                },
                "human_review",
            )
            self._remember(
                "review_inspection", request_id, fingerprint, "inspection", inspection_id
            )
            cleared = not rejected and self._policy_decision(revised_policy) == "clear"
            workflow_id = inspection.workflow_id

        if cleared:
            self._route_and_dispatch(workflow_id)
        return self.get_inspection(inspection_id)

    # -- Read models --------------------------------------------------------

    def list_scenarios(self) -> List[Dict[str, Any]]:
        return deepcopy([item for item in SCENARIOS if not item.get("hidden")])

    def list_workers(self) -> List[Dict[str, Any]]:
        with self._lock:
            self._sync_all_engine_events_locked()
            physical_state = self.orchestrator.snapshot()
            workers = [
                self._physical_worker_view(agent, physical_state["workflows"])
                for agent in physical_state["agents"]
            ]
            workers.extend(self._delivery_worker_view(worker) for worker in DELIVERY_WORKERS)
            workers.extend((self._vision_worker_view(), self._human_worker_view()))
            return workers

    def get_worker(self, worker_id: str) -> Dict[str, Any]:
        workers = self.list_workers()
        for worker in workers:
            if worker["id"] == worker_id:
                return worker
        raise CoordinatorError(f"Unknown worker: {worker_id}", "WORKER_NOT_FOUND", 404)

    def events(self, workflow_id: str, after_sequence: int = 0) -> Dict[str, Any]:
        try:
            cursor = int(after_sequence)
        except (TypeError, ValueError) as exc:
            raise CoordinatorError("after_sequence must be an integer.", "INVALID_CURSOR", 400) from exc
        if cursor < 0:
            raise CoordinatorError("after_sequence cannot be negative.", "INVALID_CURSOR", 400)
        with self._lock:
            self._record(workflow_id)
            self._sync_engine_events_locked(workflow_id)
            self._refresh_from_engine_locked(workflow_id, self._record(workflow_id))
            items = [
                deepcopy(item)
                for item in self._events
                if item["workflow_id"] == workflow_id and item["sequence"] > cursor
            ]
            return {
                "workflow_id": workflow_id,
                "after_sequence": cursor,
                "events": items,
                "last_sequence": items[-1]["sequence"] if items else cursor,
            }

    def idempotency_metadata(
        self, request_id: Optional[str], operation: Optional[str] = None
    ) -> Dict[str, Any]:
        """Return replay metadata without coupling the coordinator to HTTP headers."""
        if not request_id:
            return {"request_id": request_id, "replayed": False}
        with self._lock:
            if operation:
                replayed = self._idempotency_replays.get((operation, request_id), False)
            else:
                replayed = any(
                    value
                    for (stored_operation, stored_id), value in self._idempotency_replays.items()
                    if stored_id == request_id
                )
            return {"request_id": request_id, "replayed": replayed}

    # -- Internal inspection/routing execution -----------------------------

    def _run_inspection(self, inspection_id: str, vision_mode: Optional[str]) -> None:
        provider = self._provider(vision_mode)
        with self._lock:
            inspection = self._inspection(inspection_id)
            workflow = self._record(inspection.workflow_id)
            inspection.attempt += 1
            inspection.status = "running"
            inspection.error = None
            inspection.updated_at = utc_now()
            workflow.status = "inspecting"
            workflow.phase = "vision"
            workflow.error = None
            workflow.updated_at = utc_now()
            provider_name = str(
                getattr(provider, "provider_name", None)
                or getattr(provider, "name", None)
                or getattr(provider, "mode", None)
                or provider.__class__.__name__
            )
            inspection.provider = provider_name
            self._append_event_locked(
                inspection.workflow_id,
                "inspection.started",
                "Vision inspection started",
                {
                    "inspection_id": inspection.id,
                    "attempt": inspection.attempt,
                    "provider": provider_name,
                },
                "vision",
            )
            scenario_id = inspection.scenario_id
            workflow_id = inspection.workflow_id
            object_id = inspection.object_id

        try:
            raw = provider.inspect(scenario_id, workflow_id, object_id)
            result = deepcopy(dict(raw))
            if self._inspection_failed(result):
                error = self._normalize_provider_error(result.get("error"))
                self._record_inspection_failure(inspection_id, error)
                return
            policy = deepcopy(dict(self.policy_evaluator(deepcopy(result))))
        except Exception as exc:
            self._record_inspection_failure(
                inspection_id,
                {
                    "code": "VISION_PROVIDER_ERROR",
                    "message": str(exc) or exc.__class__.__name__,
                    "retryable": True,
                },
            )
            return

        with self._lock:
            inspection = self._inspection(inspection_id)
            # Assign fresh objects so the provider result remains immutable even
            # when later reviews apply policy overrides.
            inspection.result = deepcopy(result)
            inspection.policy = deepcopy(policy)
            inspection.error = None
            decision = self._policy_decision(policy)
            inspection.status = "cleared" if decision == "clear" else "review_required"
            inspection.updated_at = utc_now()
            workflow = self._record(inspection.workflow_id)
            if decision == "clear":
                workflow.status = "ready_for_routing"
                workflow.phase = "routing"
                workflow.error = None
            else:
                workflow.status = "attention_required"
                workflow.phase = "review"
                workflow.error = self._policy_error(policy)
                workflow.route = self._blocked_route(workflow.error["message"])
            workflow.updated_at = utc_now()
            self._append_event_locked(
                inspection.workflow_id,
                "inspection.completed",
                "Vision inspection completed",
                {
                    "inspection_id": inspection.id,
                    "scenario_id": inspection.scenario_id,
                    "provider": inspection.provider,
                },
                "vision",
            )
            self._append_event_locked(
                inspection.workflow_id,
                "policy.evaluated",
                "Inspection policy cleared dispatch"
                if decision == "clear"
                else "Inspection policy requires human attention",
                {
                    "inspection_id": inspection.id,
                    "decision": decision,
                    "signals": deepcopy(policy.get("signals") or []),
                },
                "policy",
            )

    def _record_inspection_failure(self, inspection_id: str, error: Dict[str, Any]) -> None:
        with self._lock:
            inspection = self._inspection(inspection_id)
            inspection.status = "service_unavailable"
            inspection.error = deepcopy(error)
            inspection.result = None
            inspection.policy = None
            inspection.updated_at = utc_now()
            workflow = self._record(inspection.workflow_id)
            workflow.status = "attention_required"
            workflow.phase = "vision"
            workflow.error = deepcopy(error)
            workflow.route = self._blocked_route(error["message"])
            workflow.updated_at = utc_now()
            self._append_event_locked(
                inspection.workflow_id,
                "inspection.failed",
                "Vision service could not complete the inspection",
                {"inspection_id": inspection.id, "error": deepcopy(error)},
                "vision",
            )

    def _route_and_dispatch(self, workflow_id: str) -> None:
        with self._lock:
            record = self._record(workflow_id)
            if record.physical_started:
                return
            inspection = self._current_inspection_locked(record)
            if not inspection or self._policy_decision(inspection.policy) != "clear":
                record.status = "attention_required"
                record.phase = "routing"
                record.route = self._blocked_route("Inspection policy has not cleared dispatch.")
                record.error = {
                    "code": "ROUTING_BLOCKED",
                    "message": "Inspection policy has not cleared dispatch.",
                    "retryable": False,
                }
                record.updated_at = utc_now()
                return

            condition = self._inspection_condition(inspection)
            repackaged = any(
                review["resolution"]
                in {"repackaged", "repackaged_and_cleared", "repackaged_cleared"}
                for review in inspection.reviews
            )
            if condition == "normal" and not repackaged:
                worker = DELIVERY_WORKERS[0]
                reason = "Normal verified packages use the autonomous delivery robot."
            elif condition == "damaged" and repackaged:
                worker = DELIVERY_WORKERS[1]
                reason = "A repackaged damaged parcel is assigned to the delivery van."
            else:
                reason = "The available evidence does not permit a delivery route."
                record.route = self._blocked_route(reason)
                record.status = "attention_required"
                record.phase = "routing"
                record.error = {
                    "code": "NO_ELIGIBLE_ROUTE",
                    "message": reason,
                    "retryable": False,
                }
                record.updated_at = utc_now()
                self._append_event_locked(
                    workflow_id,
                    "routing.blocked",
                    reason,
                    {"inspection_id": inspection.id},
                    "coordinator",
                )
                return

            candidates = self._route_candidates(worker["id"], reason)
            record.route = {
                "status": "selected",
                "worker_id": worker["id"],
                "recommended_worker_id": worker["id"],
                "worker_type": worker["worker_type"],
                "mode": worker["worker_type"],
                "reason": reason,
                "candidates": candidates,
                "recommended_at": utc_now(),
            }
            record.status = "routing"
            record.phase = "routing"
            record.error = None
            record.updated_at = utc_now()
            self._append_event_locked(
                workflow_id,
                "routing.recommended",
                reason,
                {
                    "worker_id": worker["id"],
                    "worker_type": worker["worker_type"],
                    "inspection_id": inspection.id,
                },
                "coordinator",
            )
            # Set this before handing control to a background thread so repeated
            # requests cannot dispatch the physical workflow twice.
            record.physical_started = True
            record.status = "running"
            record.phase = "physical_execution"
            record.updated_at = utc_now()
            self._append_event_locked(
                workflow_id,
                "physical.dispatch_requested",
                "Verified work was released to the physical orchestrator",
                {"route_worker_id": worker["id"]},
                "coordinator",
            )

        try:
            if self.background_execution:
                self.orchestrator.start(workflow_id)
            else:
                self.orchestrator.run(workflow_id)
        except Exception as exc:
            with self._lock:
                record = self._record(workflow_id)
                record.status = "attention_required"
                record.phase = "physical_execution"
                record.error = {
                    "code": "PHYSICAL_DISPATCH_FAILED",
                    "message": str(exc),
                    "retryable": True,
                }
                record.updated_at = utc_now()
                self._append_event_locked(
                    workflow_id,
                    "physical.dispatch_failed",
                    "The physical orchestrator did not accept the workflow",
                    {"error": deepcopy(record.error)},
                    "coordinator",
                )
            return

        with self._lock:
            self._sync_engine_events_locked(workflow_id)
            self._refresh_from_engine_locked(workflow_id, self._record(workflow_id))

    # -- View helpers -------------------------------------------------------

    def _workflow_view_locked(
        self,
        record: _WorkflowRecord,
        physical: Dict[str, Any],
        inspection: Optional[Dict[str, Any]],
        events: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        result = deepcopy(physical)
        current_worker_id = self._current_worker_id(record, physical)
        current_worker = self._current_worker_view(current_worker_id)
        current_step = self._current_step_view(record, physical)
        result.update(
            {
                "object_id": physical["package_id"],
                "scenario_id": record.scenario_id,
                "status": record.status,
                "phase": self._public_phase(record, physical),
                "coordinator_phase": record.phase,
                "physical_status": physical["status"],
                "inspection_id": record.inspection_id,
                "inspection": inspection,
                "routing": deepcopy(record.route),
                "route": deepcopy(record.route),
                "error": deepcopy(record.error),
                "phases": self._phase_views(record, physical, inspection),
                "vision_gate": self._vision_gate_view(record, inspection),
                "permitted_recovery_actions": self._permitted_recovery_actions(
                    record, physical, inspection
                ),
                "progress": self._workflow_progress(record, physical),
                "progress_percent": self._workflow_progress(record, physical),
                "current_worker_id": current_worker_id,
                "current_worker": current_worker,
                "current_step": current_step,
                "current_action": (current_step or {}).get("description")
                or (current_step or {}).get("name"),
                "events": events,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )
        return result

    def _current_worker_view(self, worker_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not worker_id:
            return None
        names = {
            "package-vision-01": ("Package Vision 01", "ai"),
            "human-inspector-demo": ("Human Inspector", "human"),
            "delivery-robot-01": ("Delivery Robot 01", "robot"),
            "delivery-van-07": ("Delivery Van 07", "human"),
        }
        if worker_id in names:
            name, kind = names[worker_id]
            return {"id": worker_id, "name": name, "kind": kind}
        agent = self.orchestrator.agents.get(worker_id)
        if agent:
            snapshot = agent.snapshot()
            return {"id": worker_id, "name": snapshot["name"], "kind": "robot"}
        return {"id": worker_id, "name": worker_id, "kind": "robot"}

    @staticmethod
    def _public_phase(record: _WorkflowRecord, physical: Mapping[str, Any]) -> str:
        """Map internal coordination states to the locked application vocabulary."""
        if record.status == "completed":
            return "completed"
        if record.phase == "review":
            return "vision_review"
        if record.phase == "vision":
            return "vision_analyzing" if record.status != "pending" else "vision_pending"
        if record.phase == "routing":
            return "routing"
        if record.phase == "physical_execution":
            if physical.get("status") == WorkflowStatus.PENDING.value:
                return "delivery_recommended"
            steps = list(physical.get("steps") or [])
            if steps:
                index = min(int(physical.get("current_step_index") or 0), len(steps) - 1)
                capability = steps[index].get("capability")
                return {
                    "pack_and_verify": "packing",
                    "move_package": "warehouse_transport",
                    "load_vehicle": "loading",
                }.get(str(capability), "delivery_recommended")
            return "delivery_recommended"
        return "vision_pending"

    def _inspection_view_locked(self, inspection: _InspectionRecord) -> Dict[str, Any]:
        return {
            "id": inspection.id,
            "scenario_id": inspection.scenario_id,
            "workflow_id": inspection.workflow_id,
            "object_id": inspection.object_id,
            "status": inspection.status,
            "attempt": inspection.attempt,
            "provider": inspection.provider,
            "result": deepcopy(inspection.result),
            "analysis": deepcopy((inspection.result or {}).get("analysis")),
            "policy": deepcopy(inspection.policy),
            "error": deepcopy(inspection.error),
            "reviews": deepcopy(inspection.reviews),
            "created_at": inspection.created_at,
            "updated_at": inspection.updated_at,
        }

    def _phase_views(
        self,
        record: _WorkflowRecord,
        physical: Mapping[str, Any],
        inspection: Optional[Mapping[str, Any]],
    ) -> List[Dict[str, Any]]:
        ordered = ["vision", "review", "routing", "physical_execution"]
        active_index = ordered.index(record.phase) if record.phase in ordered else len(ordered)
        phases: List[Dict[str, Any]] = []
        for index, phase_id in enumerate(ordered):
            if phase_id == "review" and inspection and not inspection.get("reviews"):
                skipped = self._policy_decision(inspection.get("policy")) == "clear"
            else:
                skipped = False
            if record.status == "completed" or index < active_index:
                status = "skipped" if skipped else "completed"
            elif index == active_index:
                status = "attention_required" if record.status == "attention_required" else "active"
            else:
                status = "pending"
            phases.append(
                {
                    "id": phase_id,
                    "name": {
                        "vision": "Vision inspection",
                        "review": "Human review",
                        "routing": "Route recommendation",
                        "physical_execution": "Physical execution",
                    }[phase_id],
                    "status": status,
                }
            )
        return phases

    def _vision_gate_view(
        self,
        record: _WorkflowRecord,
        inspection: Optional[Mapping[str, Any]],
    ) -> Dict[str, Any]:
        if not inspection:
            state = "pending"
            decision = None
            signals: List[Any] = []
            error = None
        else:
            state = str(inspection.get("status") or "pending")
            if state == "running":
                state = "analyzing"
            policy = inspection.get("policy") or {}
            decision = policy.get("decision")
            signals = deepcopy(policy.get("signals") or [])
            error = deepcopy(inspection.get("error"))
        return {
            "state": state,
            "inspection_id": inspection.get("id") if inspection else None,
            "decision": decision,
            "signals": signals,
            "error": error,
            "cleared": bool(decision == "clear" and not error),
            "blocks_physical_execution": not record.physical_started,
        }

    def _permitted_recovery_actions(
        self,
        record: _WorkflowRecord,
        physical: Mapping[str, Any],
        inspection: Optional[Mapping[str, Any]],
    ) -> List[str]:
        if record.status in {"completed", "cancelled"}:
            return []
        if record.status == "pending":
            return ["start_workflow"]
        if inspection and inspection.get("error"):
            return ["retry_inspection"] if inspection["error"].get("retryable") else []
        if record.phase == "review":
            return ["submit_review"]
        if (
            record.phase == "physical_execution"
            and physical.get("status") == WorkflowStatus.ATTENTION_REQUIRED.value
        ):
            return ["retry_physical"] if (record.error or {}).get("retryable") else []
        return []

    @staticmethod
    def _workflow_progress(record: _WorkflowRecord, physical: Mapping[str, Any]) -> int:
        if record.status == "completed":
            return 100
        if record.status == "cancelled":
            return 25
        if record.phase == "vision":
            return 10 if record.status == "inspecting" else 0
        if record.phase == "review":
            return 25
        if record.phase == "routing":
            return 45
        steps = list(physical.get("steps") or [])
        if record.phase == "physical_execution" and steps:
            completed = sum(1 for step in steps if step.get("status") == "completed")
            return min(95, 50 + int(45 * completed / len(steps)))
        return 0

    @staticmethod
    def _current_worker_id(
        record: _WorkflowRecord, physical: Mapping[str, Any]
    ) -> Optional[str]:
        if record.phase == "vision":
            return "package-vision-01"
        if record.phase == "review":
            return "human-inspector-demo" if record.status != "cancelled" else None
        if record.phase == "routing":
            return (record.route or {}).get("worker_id")
        if record.phase == "physical_execution":
            for step in physical.get("steps") or []:
                if step.get("status") in {"reserved", "executing", "verifying", "failed"}:
                    return step.get("assigned_agent_id")
            return (record.route or {}).get("worker_id")
        return None

    @staticmethod
    def _current_step_view(
        record: _WorkflowRecord, physical: Mapping[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if record.phase in {"vision", "review", "routing"}:
            return {
                "id": record.phase,
                "name": {
                    "vision": "Vision inspection",
                    "review": "Human review",
                    "routing": "Route recommendation",
                }[record.phase],
                "status": record.status,
            }
        steps = list(physical.get("steps") or [])
        if not steps:
            return None
        index = min(int(physical.get("current_step_index") or 0), len(steps) - 1)
        return deepcopy(steps[index])

    def _physical_worker_view(
        self, snapshot: Dict[str, Any], workflows: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        attempts = 0
        completed = 0
        for workflow in workflows:
            for step in workflow["steps"]:
                if step["assigned_agent_id"] != snapshot["id"]:
                    continue
                attempts += step["attempt"]
                if step["status"] == "completed":
                    completed += 1
        failed = max(0, attempts - completed)
        reliability = completed / attempts if attempts else 1.0
        return {
            **deepcopy(snapshot),
            "worker_type": snapshot.get("agent_type"),
            "kind": "robot",
            "role": "physical_worker",
            "custody_capable": True,
            "reliability": {
                "attempts": attempts,
                "completions": completed,
                "failures": failed,
                "interventions": 0,
                "success_rate": round(reliability, 4),
                "intervention_rate": 0.0,
            },
        }

    def _delivery_worker_view(self, worker: Dict[str, Any]) -> Dict[str, Any]:
        selected = 0
        completed = 0
        failed = 0
        for workflow_id, record in self._workflows.items():
            if not record.route or record.route.get("worker_id") != worker["id"]:
                continue
            selected += 1
            status = self.orchestrator.workflow_snapshot(workflow_id)["status"]
            if status == WorkflowStatus.COMPLETED.value:
                completed += 1
            elif status == WorkflowStatus.ATTENTION_REQUIRED.value:
                failed += 1
        decided = completed + failed
        reliability = completed / decided if decided else 1.0
        return {
            **deepcopy(worker),
            "kind": "robot" if worker["worker_type"] == "robot" else "human",
            "subtype": worker["agent_type"],
            "status": "available",
            "active_step_id": None,
            "role": "routing_candidate",
            "custody_capable": True,
            "reliability": {
                "attempts": selected,
                "completions": completed,
                "failures": failed,
                "interventions": 0,
                "success_rate": round(reliability, 4),
                "intervention_rate": 0.0,
            },
        }

    def _vision_worker_view(self) -> Dict[str, Any]:
        attempts = sum(1 for item in self._events if item["type"] == "inspection.started")
        failures = sum(1 for item in self._events if item["type"] == "inspection.failed")
        completions = sum(1 for item in self._events if item["type"] == "inspection.completed")
        interventions = sum(1 for item in self._events if item["type"] == "inspection.reviewed")
        return {
            "id": "package-vision-01",
            "name": "Package Vision 01",
            "kind": "ai",
            "worker_type": "vision_ai",
            "agent_type": "vision_ai",
            "role": "inspection",
            "location": "cloud",
            "status": "available",
            "active_step_id": None,
            "capabilities": ["package_inspection", "evidence_generation"],
            "custody_capable": False,
            "reliability": {
                "attempts": attempts,
                "completions": completions,
                "failures": failures,
                "interventions": interventions,
                "success_rate": round(completions / attempts, 4) if attempts else 1.0,
                "intervention_rate": round(interventions / completions, 4)
                if completions
                else 0.0,
                "provider_failure_rate": round(failures / attempts, 4) if attempts else 0.0,
                "correction_rate": round(interventions / completions, 4)
                if completions
                else 0.0,
            },
        }

    def _human_worker_view(self) -> Dict[str, Any]:
        reviews = [review for item in self._inspections.values() for review in item.reviews]
        completions = sum(
            1
            for review in reviews
            if self._policy_decision(review.get("policy")) == "clear"
            or review.get("resolution") == "rejected"
        )
        failures = len(reviews) - completions
        return {
            "id": "human-inspector-demo",
            "name": "Human Inspector",
            "kind": "human",
            "worker_type": "human_inspector",
            "agent_type": "human_inspector",
            "role": "review",
            "location": "operations_desk",
            "status": "available",
            "active_step_id": None,
            "capabilities": ["inspection_review", "evidence_correction", "package_clearance"],
            "custody_capable": False,
            "reliability": {
                "attempts": len(reviews),
                "completions": completions,
                "failures": failures,
                "interventions": len(reviews),
                "success_rate": round(completions / len(reviews), 4) if reviews else 1.0,
                "intervention_rate": 1.0 if reviews else 0.0,
            },
        }

    # -- State/event/idempotency helpers -----------------------------------

    def _refresh_from_engine_locked(
        self, workflow_id: str, record: _WorkflowRecord
    ) -> None:
        if not record.physical_started:
            return
        physical = self.orchestrator.workflow_snapshot(workflow_id)
        status = physical["status"]
        if status == WorkflowStatus.COMPLETED.value:
            record.status = "completed"
            record.phase = "completed"
            record.error = None
        elif status == WorkflowStatus.ATTENTION_REQUIRED.value:
            record.status = "attention_required"
            record.phase = "physical_execution"
            failed = next((step for step in physical["steps"] if step["status"] == "failed"), None)
            record.error = deepcopy((failed or {}).get("error"))
        elif status in {WorkflowStatus.PENDING.value, WorkflowStatus.RUNNING.value}:
            record.status = "running"
            record.phase = "physical_execution"
        record.updated_at = physical.get("updated_at") or utc_now()

    def _sync_engine_events_locked(self, workflow_id: str) -> None:
        physical = self.orchestrator.workflow_snapshot(workflow_id)
        cursor = self._engine_event_cursors.get(workflow_id, 0)
        for event in physical.get("events", []):
            source_sequence = int(event.get("sequence", 0))
            if source_sequence <= cursor:
                continue
            data = deepcopy(event.get("data") or {})
            data["source_sequence"] = source_sequence
            self._append_event_locked(
                workflow_id,
                str(event.get("type") or "physical.event"),
                str(event.get("message") or "Physical orchestration event"),
                data,
                "physical_orchestrator",
                occurred_at=event.get("occurred_at"),
            )
            cursor = source_sequence
        self._engine_event_cursors[workflow_id] = cursor

    def _sync_all_engine_events_locked(self) -> None:
        for workflow_id in self._workflows:
            self._sync_engine_events_locked(workflow_id)
            self._refresh_from_engine_locked(workflow_id, self._workflows[workflow_id])

    def _append_event_locked(
        self,
        workflow_id: str,
        event_type: str,
        message: str,
        data: Optional[Dict[str, Any]],
        source: str,
        occurred_at: Optional[str] = None,
    ) -> None:
        self._event_sequence += 1
        self._events.append(
            {
                "id": f"evt_{self._event_sequence:08d}",
                "sequence": self._event_sequence,
                "type": event_type,
                "workflow_id": workflow_id,
                "message": message,
                "data": deepcopy(data or {}),
                "source": source,
                "occurred_at": occurred_at or utc_now(),
            }
        )

    def _replay(
        self, operation: str, request_id: Optional[str], fingerprint: str
    ) -> Optional[_IdempotencyEntry]:
        if not request_id:
            return None
        key = (operation, request_id)
        with self._lock:
            entry = self._idempotency.get(key)
            if entry and entry.fingerprint != fingerprint:
                raise CoordinatorError(
                    "The request id was already used with a different payload.",
                    "IDEMPOTENCY_CONFLICT",
                    409,
                )
            self._idempotency_replays[key] = entry is not None
            return entry

    def _remember(
        self,
        operation: str,
        request_id: Optional[str],
        fingerprint: str,
        resource_type: str,
        resource_id: str,
    ) -> None:
        if not request_id:
            return
        key = (operation, request_id)
        self._idempotency[key] = _IdempotencyEntry(
            fingerprint=fingerprint,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        self._idempotency_replays[key] = False

    @staticmethod
    def _fingerprint(value: Mapping[str, Any]) -> str:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
        return hashlib.sha256(encoded).hexdigest()

    def _provider(self, vision_mode: Optional[str]) -> VisionProvider:
        mode = str(vision_mode or "default").lower()
        provider = self.vision_providers.get(mode)
        if provider is None:
            raise CoordinatorError(
                f"Unknown vision mode: {mode}", "UNKNOWN_VISION_MODE", 400
            )
        return provider

    def _record(self, workflow_id: str) -> _WorkflowRecord:
        record = self._workflows.get(workflow_id)
        if not record:
            raise CoordinatorError(f"Unknown workflow: {workflow_id}", "WORKFLOW_NOT_FOUND", 404)
        return record

    def _inspection(self, inspection_id: str) -> _InspectionRecord:
        inspection = self._inspections.get(inspection_id)
        if not inspection:
            raise CoordinatorError(
                f"Unknown inspection: {inspection_id}", "INSPECTION_NOT_FOUND", 404
            )
        return inspection

    def _current_inspection_locked(
        self, record: _WorkflowRecord
    ) -> Optional[_InspectionRecord]:
        return self._inspections.get(record.inspection_id) if record.inspection_id else None

    @staticmethod
    def _inspection_failed(result: Mapping[str, Any]) -> bool:
        return str(result.get("status") or "completed").lower() in {
            "failed",
            "error",
            "service_unavailable",
            "unavailable",
        }

    @staticmethod
    def _normalize_provider_error(error: Any) -> Dict[str, Any]:
        if isinstance(error, Mapping):
            return {
                "code": str(error.get("code") or "VISION_SERVICE_UNAVAILABLE"),
                "message": str(error.get("message") or "Vision service is unavailable."),
                "retryable": bool(error.get("retryable", True)),
            }
        return {
            "code": "VISION_SERVICE_UNAVAILABLE",
            "message": str(error or "Vision service is unavailable."),
            "retryable": True,
        }

    @staticmethod
    def _policy_decision(policy: Optional[Mapping[str, Any]]) -> str:
        if not policy:
            return "review_required"
        decision = str(policy.get("decision") or policy.get("status") or "review_required").lower()
        return "clear" if decision in {"clear", "cleared", "pass", "approved"} else "review_required"

    @staticmethod
    def _policy_error(policy: Mapping[str, Any]) -> Dict[str, Any]:
        reasons = [str(item) for item in policy.get("reasons") or []]
        return {
            "code": "REVIEW_REQUIRED",
            "message": reasons[0] if reasons else "Inspection policy requires human review.",
            "retryable": False,
            "signals": deepcopy(policy.get("signals") or []),
        }

    @staticmethod
    def _review_overrides(
        inspection: _InspectionRecord, resolution: str, body: Mapping[str, Any]
    ) -> Dict[str, Any]:
        explicit = body.get("overrides") or body.get("corrections") or {}
        if explicit and not isinstance(explicit, Mapping):
            raise CoordinatorError("Review overrides must be an object.", "INVALID_REVIEW", 400)
        overrides = dict(explicit)
        if resolution in {"repackaged", "repackaged_and_cleared", "repackaged_cleared"}:
            overrides.update(
                {
                    "package_detected": True,
                    "visible_damage": "none",
                    "damage_indicators": [],
                    "label_present": True,
                    "label_readable": True,
                }
            )
        elif resolution in {"corrected", "correction"}:
            if not overrides:
                raise CoordinatorError(
                    "A correction must include observation overrides.", "INVALID_REVIEW", 400
                )
        elif resolution in {
            "approved",
            "cleared",
            "cleared_by_inspector",
            "inspector_override",
        }:
            overrides.setdefault("package_detected", True)
            overrides.setdefault("visible_damage", "none")
            overrides.setdefault("damage_indicators", [])
            overrides.setdefault("label_present", True)
            overrides.setdefault("label_readable", True)
        elif resolution in {"rejected", "blocked", "deny", "denied"}:
            overrides["package_detected"] = False
        else:
            raise CoordinatorError(
                f"Unsupported review resolution: {resolution}", "INVALID_REVIEW", 400
            )
        return overrides

    @staticmethod
    def _inspection_condition(inspection: _InspectionRecord) -> str:
        if inspection.reviews:
            latest = inspection.reviews[-1]
            if latest["resolution"] in {
                "repackaged",
                "repackaged_and_cleared",
                "repackaged_cleared",
            }:
                return "damaged"
        policy_observations = (inspection.policy or {}).get("effective_observations") or {}
        if policy_observations:
            return _condition_from_observations(policy_observations)
        result_observations = ((inspection.result or {}).get("analysis") or {}).get("observations") or {}
        return _condition_from_observations(result_observations)

    @staticmethod
    def _route_candidates(selected_worker_id: str, selected_reason: str) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for worker in DELIVERY_WORKERS:
            selected = worker["id"] == selected_worker_id
            candidates.append(
                {
                    "worker_id": worker["id"],
                    "worker_type": worker["worker_type"],
                    "eligible": selected,
                    "reason": selected_reason
                    if selected
                    else "This worker does not match the verified package condition.",
                }
            )
        return candidates

    @staticmethod
    def _blocked_route(reason: str) -> Dict[str, Any]:
        return {
            "status": "blocked",
            "worker_id": None,
            "recommended_worker_id": None,
            "worker_type": None,
            "mode": None,
            "reason": reason,
            "candidates": [
                {
                    "worker_id": worker["id"],
                    "worker_type": worker["worker_type"],
                    "eligible": False,
                    "reason": reason,
                }
                for worker in DELIVERY_WORKERS
            ],
            "recommended_at": utc_now(),
        }


# Descriptive alias for callers that prefer the product name.
OrbisCoordinator = Coordinator


def create_demo_coordinator(
    step_delay: float = 0.45,
    *,
    vision_provider: Optional[VisionProvider] = None,
    background_execution: bool = True,
) -> Coordinator:
    return Coordinator(
        create_demo_orchestrator(step_delay=step_delay),
        vision_provider=vision_provider,
        background_execution=background_execution,
    )


__all__ = [
    "Coordinator",
    "CoordinatorError",
    "OrbisCoordinator",
    "create_demo_coordinator",
]
