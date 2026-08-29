"""Outcome-level coordination for the curated Home dinner demonstration.

This coordinator sits above the existing warehouse coordinator.  It owns the
cross-space dependency graph and delegates package inspection and physical
warehouse execution without changing the established custody engine.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import json
from threading import RLock, Thread
from time import sleep
from typing import Any, Dict, List, Mapping, Optional, Tuple
from uuid import uuid4

from .coordinator import Coordinator, CoordinatorError
from .models import utc_now
from .planning import DinnerPlanner, FixtureDinnerPlanner, PlanningError
from .task_graph import TaskGraph, TaskGraphError, TaskNode, TaskStatus


class OutcomeError(RuntimeError):
    """Stable outcome error for translation by the HTTP layer."""

    def __init__(self, message: str, code: str = "OUTCOME_ERROR", status_code: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass
class _PlanRecord:
    id: str
    plan: Dict[str, Any]
    status: str = "awaiting_approval"
    outcome_id: Optional[str] = None
    approval: Optional[Dict[str, Any]] = None
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)


@dataclass
class _OutcomeRecord:
    id: str
    plan_id: str
    graph: TaskGraph
    status: str = "scheduled"
    phase: str = "planning"
    warehouse_workflow_id: Optional[str] = None
    routing: Dict[str, Any] = field(default_factory=dict)
    custody: Dict[str, Any] = field(default_factory=dict)
    attention: Optional[Dict[str, Any]] = None
    evidence: List[Dict[str, Any]] = field(default_factory=list)
    started: bool = False
    worker_running: bool = False
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)


@dataclass(frozen=True)
class _IdempotencyEntry:
    fingerprint: str
    resource_type: str
    resource_id: str


def _task(
    task_id: str,
    name: str,
    lane: str,
    capability: str,
    worker_id: str,
    dependencies: Tuple[str, ...] = (),
    *,
    weight: float = 1.0,
) -> TaskNode:
    return TaskNode(
        id=task_id,
        name=name,
        lane=lane,
        capability=capability,
        assigned_worker_id=None,
        dependencies=list(dependencies),
        weight=weight,
        metadata={"proposed_worker_id": worker_id, "execution_mode": "simulated"},
    )


def build_dinner_graph() -> TaskGraph:
    """Return the locked three-lane graph rendered in the right Workflow rail."""

    return TaskGraph(
        [
            _task("wh_reserve", "Reserve inventory", "warehouse", "reserve_inventory", "warehouse-control"),
            _task("wh_produce", "Pick produce", "warehouse", "pick_produce", "produce-picker-01", ("wh_reserve",)),
            _task("wh_dry", "Pick dry goods", "warehouse", "pick_dry_goods", "dry-goods-picker-01", ("wh_reserve",)),
            _task("wh_cold", "Pick cold storage", "warehouse", "pick_cold_storage", "cold-storage-picker-01", ("wh_reserve",)),
            _task("wh_consolidate", "Consolidate order", "warehouse", "consolidate_order", "warehouse-control", ("wh_produce", "wh_dry", "wh_cold")),
            _task("wh_vision", "Inspect package", "warehouse", "inspect_package", "package-vision-01", ("wh_consolidate",), weight=1.4),
            _task("wh_pack", "Pack and verify", "warehouse", "pack_and_verify", "packing-arm-01", ("wh_vision",)),
            _task("wh_stage", "Move and load order", "warehouse", "stage_delivery", "amr-01", ("wh_pack",)),
            _task("delivery_route", "Select delivery worker", "delivery", "recommend_delivery", "orbis-orchestrator", ("wh_vision",)),
            _task("delivery_transit", "Deliver groceries", "delivery", "last_mile_delivery", "delivery-large-01", ("wh_stage", "delivery_route"), weight=1.5),
            _task("home_floors", "Clean floors", "home", "clean_floor", "home-roomba-01"),
            _task("home_stage", "Stage kitchen", "home", "stage_kitchen", "home-loader-01"),
            _task("home_furniture", "Set table and chairs", "home", "configure_table", "home-furniture-01"),
            _task("home_lighting", "Set preparation lighting", "home", "set_preparation_lighting", "home-lamp-agent-01"),
            _task("home_receive", "Receive groceries", "home", "receive_delivery", "home-loader-01", ("delivery_transit", "home_stage"), weight=1.2),
            _task("home_cook", "Cook vegetarian pasta", "home", "cook_meal", "home-humanoid-cook-01", ("home_receive",), weight=2.0),
            _task("home_verify", "Verify dinner readiness", "home", "verify_dinner", "orbis-orchestrator", ("home_cook", "home_floors", "home_furniture", "home_lighting"), weight=1.2),
            _task("dinner_ready", "Dinner ready", "home", "announce_ready", "orbis-orchestrator", ("home_verify",)),
            _task("cleanup_gate", "Wait for dinner to end", "home", "host_confirmation", "host", ("dinner_ready",), weight=0.2),
            _task("cleanup_surfaces", "Clear and clean surfaces", "home", "clean_surfaces", "home-loader-01", ("cleanup_gate",)),
            _task("cleanup_leftovers", "Store leftovers", "home", "store_leftovers", "home-humanoid-cook-01", ("cleanup_gate",)),
            _task("cleanup_furniture", "Restore furniture", "home", "restore_layout", "home-furniture-01", ("cleanup_gate",)),
            _task("cleanup_floors", "Final floor clean", "home", "clean_floor", "home-roomba-01", ("cleanup_surfaces",)),
            _task("cleanup_lighting", "Restore lighting", "home", "restore_lighting", "home-lamp-agent-01", ("cleanup_gate",)),
            _task("cleanup_verify", "Verify home restored", "home", "verify_cleanup", "orbis-orchestrator", ("cleanup_surfaces", "cleanup_leftovers", "cleanup_furniture", "cleanup_floors", "cleanup_lighting"), weight=1.2),
        ]
    )


class OutcomeCoordinator:
    """Coordinate a dinner outcome across Warehouse, Delivery, and Home."""

    def __init__(
        self,
        warehouse: Coordinator,
        planner: Optional[DinnerPlanner] = None,
        *,
        background_execution: bool = True,
        step_delay_seconds: float = 0.12,
    ) -> None:
        self.warehouse = warehouse
        self.planner = planner or FixtureDinnerPlanner()
        self.background_execution = background_execution
        self.step_delay_seconds = step_delay_seconds
        self._plans: Dict[str, _PlanRecord] = {}
        self._outcomes: Dict[str, _OutcomeRecord] = {}
        self._events: Dict[str, List[Dict[str, Any]]] = {}
        self._sequence: Dict[str, int] = {}
        self._idempotency: Dict[Tuple[str, str], _IdempotencyEntry] = {}
        self._replays: Dict[Tuple[str, str], bool] = {}
        self._lock = RLock()

    # -- Planning ---------------------------------------------------------

    def create_plan(self, payload: Mapping[str, Any], request_id: str) -> Dict[str, Any]:
        body = dict(payload)
        fingerprint = self._fingerprint(body)
        replay = self._replay("create_plan", request_id, fingerprint)
        if replay:
            return self.get_plan(replay.resource_id)
        objective = str(body.get("objective") or "").strip()
        constraints = dict(body.get("constraints") or {})
        if "guest_count" in body:
            constraints.setdefault("guest_count", body["guest_count"])
        constraints.setdefault("guest_count", constraints.get("guests"))
        constraints.setdefault("ready_time", constraints.get("ready_by"))
        constraints.setdefault("dietary_restrictions", constraints.get("dietary"))
        try:
            proposed = self.planner.plan(objective, constraints)
        except PlanningError as exc:
            raise OutcomeError(str(exc), "INVALID_PLAN_REQUEST", 422) from exc
        plan_id = f"plan_{uuid4().hex[:12]}"
        with self._lock:
            self._plans[plan_id] = _PlanRecord(id=plan_id, plan=proposed)
            self._remember("create_plan", request_id, fingerprint, "plan", plan_id)
        return self.get_plan(plan_id)

    def get_plan(self, plan_id: str) -> Dict[str, Any]:
        with self._lock:
            record = self._plan(plan_id)
            value = deepcopy(record.plan)
            order = value.get("order") or {}
            if isinstance(order, dict):
                items = deepcopy(order.get("line_items") or [])
                for item in items:
                    if isinstance(item, dict):
                        item["quantity"] = f"{item.get('quantity', 1):g} {item.get('unit', '')}".strip()
                order.setdefault("items", items)
                order.setdefault("estimated_cost", f"${float(order.get('estimated_total') or 0):.2f}")
            value["ready_by"] = value.get("ready_time")
            value["workers"] = self._workers_view()
            policy_values = value.get("policies") or {}
            if isinstance(policy_values, dict):
                value["policies"] = [
                    f"{str(key).replace('_', ' ').title()}: {str(policy).replace('_', ' ')}"
                    for key, policy in policy_values.items()
                ]
            value["assumptions"] = [
                "Warehouse inventory and Home worker availability use curated demo fixtures.",
                "Videos are illustrative simulated feeds and never advance task state.",
            ]
            value["dinner_ready_criteria"] = deepcopy(value.get("definition_of_done") or [])
            value["cleanup_tasks"] = [
                "Clear and clean surfaces",
                "Store leftovers and secure cooking equipment",
                "Restore furniture, floors, and lighting",
                "Verify the home is restored",
            ]
            value.update(
                {
                    "id": record.id,
                    "status": record.status,
                    "scenario": "home_dinner",
                    "approval": deepcopy(record.approval),
                    "outcome_id": record.outcome_id,
                    "permitted_actions": ["approve_plan", "edit_plan", "reject_plan"]
                    if record.status == "awaiting_approval"
                    else [],
                    "created_at": record.created_at,
                    "updated_at": record.updated_at,
                }
            )
            return value

    def approve_plan(self, plan_id: str, payload: Mapping[str, Any], request_id: str) -> Dict[str, Any]:
        body = dict(payload)
        fingerprint = self._fingerprint({"plan_id": plan_id, **body})
        replay = self._replay("approve_plan", request_id, fingerprint)
        if replay:
            return self.get_outcome(replay.resource_id)
        if body.get("approve_purchase") is not True or body.get("approve_execution") is not True:
            raise OutcomeError("Purchase and execution approval are both required.", "APPROVAL_REQUIRED", 409)
        with self._lock:
            plan = self._plan(plan_id)
            if plan.status != "awaiting_approval":
                raise OutcomeError("This plan is not awaiting approval.", "INVALID_PLAN_STATE", 409)
            outcome_id = f"out_{uuid4().hex[:12]}"
            actor = str(body.get("actor_id") or "host-demo")
            plan.status = "approved"
            plan.updated_at = utc_now()
            plan.approval = {"approved_by": actor, "approved_at": plan.updated_at, "purchase": True, "execution": True}
            plan.outcome_id = outcome_id
            record = _OutcomeRecord(
                id=outcome_id,
                plan_id=plan_id,
                graph=build_dinner_graph(),
                routing=self._initial_routing(plan.plan),
                custody={"current": {"grocery_order": "warehouse-control"}, "history": []},
            )
            self._outcomes[outcome_id] = record
            self._events[outcome_id] = []
            self._sequence[outcome_id] = 0
            self._append_event(record, "outcome.approved", "Dinner plan and purchase approved", {"actor_id": actor})
            self._remember("approve_plan", request_id, fingerprint, "outcome", outcome_id)
        return self.get_outcome(outcome_id)

    # -- Execution --------------------------------------------------------

    def start_outcome(self, outcome_id: str, payload: Mapping[str, Any], request_id: str) -> Dict[str, Any]:
        body = dict(payload)
        fingerprint = self._fingerprint({"outcome_id": outcome_id, **body})
        replay = self._replay("start_outcome", request_id, fingerprint)
        if replay:
            return self.get_outcome(replay.resource_id)
        with self._lock:
            record = self._outcome(outcome_id)
            if record.status != "scheduled":
                raise OutcomeError("Outcome can only start after plan approval.", "INVALID_OUTCOME_STATE", 409)
            record.started = True
            record.status = "executing"
            record.phase = "warehouse_fulfillment"
            record.updated_at = utc_now()
            scenario_id = str(body.get("scenario_id") or "normal")
            self._plan(record.plan_id).plan["scenario_id"] = scenario_id
            self._append_event(record, "outcome.started", "Warehouse and Home preparation started in parallel", {"scenario_id": scenario_id})
            self._remember("start_outcome", request_id, fingerprint, "outcome", outcome_id)
            self._launch_locked(record)
        return self.get_outcome(outcome_id)

    def apply_action(self, outcome_id: str, payload: Mapping[str, Any], request_id: str) -> Dict[str, Any]:
        body = dict(payload)
        action = str(body.get("action") or "").strip()
        fingerprint = self._fingerprint({"outcome_id": outcome_id, **body})
        replay = self._replay("outcome_action", request_id, fingerprint)
        if replay:
            return self.get_outcome(replay.resource_id)
        with self._lock:
            record = self._outcome(outcome_id)
            permitted = self._permitted_actions(record)
            if action not in permitted:
                raise OutcomeError(f"Action {action or '(empty)'} is not permitted now.", "INVALID_STATE", 409)

        if action == "submit_vision_review":
            self._resolve_vision_review(record, body, request_id)
        elif action == "begin_cleanup":
            with self._lock:
                self._execute_graph_task_locked(record, "cleanup_gate", "host")
                record.status = "cleaning_up"
                record.phase = "cleanup"
                self._append_event(record, "cleanup.started", "Host confirmed dinner is over; cleanup started", {"actor_id": body.get("actor_id", "host-demo")})
                self._launch_locked(record)
        elif action == "keep_warm":
            with self._lock:
                self._append_event(record, "dinner.keep_warm", "Humanoid Cook is keeping dinner warm", {})
        elif action == "cancel_outcome":
            with self._lock:
                record.status = "cancelled"
                record.phase = "completed"
                self._append_event(record, "outcome.cancelled", "Outcome cancelled by host", {})
        else:
            self._recover_task(record, body, action)

        with self._lock:
            self._remember("outcome_action", request_id, fingerprint, "outcome", outcome_id)
        return self.get_outcome(outcome_id)

    def get_outcome(self, outcome_id: str) -> Dict[str, Any]:
        with self._lock:
            record = self._outcome(outcome_id)
            graph = record.graph.snapshot()
            plan = self._plan(record.plan_id)
            tasks = [self._public_task(task) for task in graph["tasks"]]
            lanes = [self._lane_view(lane, tasks) for lane in ("warehouse", "delivery", "home")]
            current = next((task for task in tasks if task["status"] in {"executing", "verifying", "attention_required"}), None)
            next_task = next((task for task in tasks if task["status"] == "ready" and task["id"] != "cleanup_gate"), None)
            workers = self._workers_view()
            active_assignments = {
                str(task.get("assigned_worker_id")): task
                for task in tasks
                if task.get("assigned_worker_id")
                and task["status"] in {"reserved", "executing", "verifying", "attention_required"}
            }
            for worker in workers:
                assignment = active_assignments.get(str(worker.get("id")))
                if assignment:
                    worker["active_assignment"] = assignment["id"]
                    worker["status"] = "attention" if assignment["status"] == "attention_required" else "working"
            current_worker_id = (current.get("assigned_worker_id") or current.get("metadata", {}).get("proposed_worker_id")) if current else None
            current_worker = next((worker for worker in workers if worker.get("id") == current_worker_id), None)
            events = deepcopy(self._events.get(outcome_id, [])[-50:])
            evidence = deepcopy(record.evidence[-50:])
            if record.warehouse_workflow_id:
                try:
                    warehouse_view = self.warehouse.get_workflow(record.warehouse_workflow_id)
                    evidence.extend(deepcopy(warehouse_view.get("evidence") or []))
                except CoordinatorError:
                    warehouse_view = None
            else:
                warehouse_view = None
            return {
                "id": record.id,
                "plan_id": record.plan_id,
                "title": plan.plan["title"],
                "objective": plan.plan["objective"],
                "scenario": "home_dinner",
                "status": record.status,
                "phase": record.phase,
                "progress_percent": graph["progress"],
                "deadline": plan.plan["ready_time"],
                "predicted_completion": "6:45 PM",
                "schedule_risk": "on_track" if not record.attention else "at_risk",
                "current_action": current["name"] if current else None,
                "current_worker_id": current_worker_id,
                "current_worker_name": current_worker.get("name") if current_worker else None,
                "next_action": next_task["name"] if next_task else None,
                "blocked_by": deepcopy(graph["active_blockers"]),
                "lanes": lanes,
                "tasks": tasks,
                "critical_path": ["wh_vision", "wh_pack", "wh_stage", "delivery_transit", "home_receive", "home_cook", "home_verify"],
                "workers": workers,
                "order": self._order_view(plan.plan, record),
                "routing": deepcopy(record.routing),
                "custody": deepcopy(record.custody),
                "warehouse_workflow": warehouse_view,
                "attention": deepcopy(record.attention),
                "permitted_actions": self._permitted_actions(record),
                "evidence": evidence,
                "events": events,
                "dinner_readiness": self._readiness_view(tasks),
                "cleanup": self._cleanup_view(tasks),
                "execution_mode": "simulated",
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }

    def events(self, outcome_id: str, after_sequence: int = 0) -> Dict[str, Any]:
        if after_sequence < 0:
            raise OutcomeError("after_sequence cannot be negative.", "INVALID_CURSOR", 400)
        with self._lock:
            self._outcome(outcome_id)
            items = [deepcopy(item) for item in self._events[outcome_id] if item["sequence"] > after_sequence]
            return {
                "outcome_id": outcome_id,
                "after_sequence": after_sequence,
                "events": items,
                "last_sequence": items[-1]["sequence"] if items else after_sequence,
            }

    def idempotency_metadata(self, request_id: str, operation: str) -> Dict[str, Any]:
        with self._lock:
            return {"request_id": request_id, "replayed": self._replays.get((operation, request_id), False)}

    # -- Background state machine ----------------------------------------

    def _launch_locked(self, record: _OutcomeRecord) -> None:
        if record.worker_running or record.status in {"cancelled", "completed"}:
            return
        record.worker_running = True
        if self.background_execution:
            Thread(target=self._run, args=(record.id,), daemon=True).start()
        else:
            self._run(record.id)

    def _run(self, outcome_id: str) -> None:
        try:
            with self._lock:
                record = self._outcome(outcome_id)
                status = record.status
            if status == "cleaning_up":
                self._run_cleanup(record)
            else:
                self._run_dinner(record)
        finally:
            with self._lock:
                if outcome_id in self._outcomes:
                    self._outcomes[outcome_id].worker_running = False

    def _run_dinner(self, record: _OutcomeRecord) -> None:
        for task_id in ("wh_reserve", "home_floors", "home_stage", "home_furniture", "home_lighting"):
            if not self._run_task(record, task_id):
                return
        for task_id in ("wh_produce", "wh_dry", "wh_cold", "wh_consolidate"):
            if not self._run_task(record, task_id):
                return
        if not self._run_warehouse(record):
            return
        for task_id in ("delivery_route", "delivery_transit", "home_receive", "home_cook", "home_verify", "dinner_ready"):
            if not self._run_task(record, task_id):
                return
            if task_id == "delivery_transit":
                self._handoff(record, "warehouse-control", "delivery-large-01", "grocery_order")
                self._handoff(record, "delivery-large-01", "home-loader-01", "grocery_order")
            if task_id == "home_receive":
                self._handoff(record, "home-loader-01", "home-humanoid-cook-01", "ingredients")
        with self._lock:
            record.status = "dinner_ready"
            record.phase = "dinner_ready"
            record.updated_at = utc_now()
            self._append_event(record, "dinner.ready", "Dinner for 12 is ready and verified", {})

    def _run_warehouse(self, record: _OutcomeRecord) -> bool:
        with self._lock:
            if self._status(record, "wh_vision") == "completed":
                return True
            plan = self._plan(record.plan_id).plan
            scenario_id = str(plan.get("scenario_id") or "normal")
            if not record.warehouse_workflow_id:
                workflow = self.warehouse.create_workflow(
                    {
                        "order_id": f"order-{record.id[-6:]}",
                        "package_id": f"pkg-{record.id[-6:]}",
                        "destination": "Home dining room",
                        "scenario_id": scenario_id,
                        "auto_start": False,
                    },
                    f"{record.id}:warehouse:create",
                )
                record.warehouse_workflow_id = workflow["id"]
                self._set_executing_locked(record, "wh_vision")
                workflow_id = workflow["id"]
            else:
                workflow_id = record.warehouse_workflow_id
                self._set_executing_locked(record, "wh_vision")
        try:
            warehouse = self.warehouse.start_workflow(workflow_id, f"{record.id}:warehouse:start")
        except CoordinatorError as exc:
            if exc.code != "WORKFLOW_ALREADY_STARTED":
                self._warehouse_attention(record, str(exc), exc.code)
                return False
            warehouse = self.warehouse.get_workflow(workflow_id)
        if warehouse["status"] == "attention_required":
            self._warehouse_attention(record, "Package inspection requires human review.", "VISION_REVIEW_REQUIRED")
            return False
        if warehouse["status"] in {"failed", "service_unavailable"}:
            self._warehouse_attention(record, "Vision service is unavailable; no work was dispatched.", "VISION_SERVICE_UNAVAILABLE")
            return False
        with self._lock:
            self._finish_executing_locked(record, "wh_vision", "Vision policy cleared the package")
            self._set_executing_locked(record, "wh_pack")
        # The physical simulator intentionally makes custody handoffs visible.
        # Keep that timing independent from the much shorter outcome-task delay
        # used by unit tests and UI animation.
        for _ in range(160):
            warehouse = self.warehouse.get_workflow(workflow_id)
            if warehouse["status"] == "completed":
                with self._lock:
                    self._finish_executing_locked(record, "wh_pack", "Physical packing completed")
                    self._execute_graph_task_locked(record, "wh_stage", "warehouse")
                return True
            if warehouse["status"] in {"attention_required", "failed"}:
                self._warehouse_attention(record, "Warehouse execution needs attention.", "WAREHOUSE_ATTENTION")
                return False
            sleep(max(0.05, self.step_delay_seconds))
        self._warehouse_attention(record, "Warehouse execution did not finish in the demo window.", "WAREHOUSE_TIMEOUT")
        return False

    def _run_cleanup(self, record: _OutcomeRecord) -> None:
        for task_id in ("cleanup_surfaces", "cleanup_leftovers", "cleanup_furniture", "cleanup_lighting", "cleanup_floors", "cleanup_verify"):
            if not self._run_task(record, task_id):
                return
        with self._lock:
            record.status = "completed"
            record.phase = "completed"
            record.updated_at = utc_now()
            self._append_event(record, "outcome.completed", "Dinner and home restoration completed", {})

    def _run_task(self, record: _OutcomeRecord, task_id: str) -> bool:
        with self._lock:
            status = self._status(record, task_id)
            if status == "completed":
                return True
            if status not in {"ready", "reserved", "executing", "verifying"}:
                return False
            self._set_executing_locked(record, task_id)
            task = record.graph.task(task_id)
            self._append_event(record, "task.started", f"{task['name']} started", {"task_id": task_id, "lane": task["lane"]})
        sleep(self.step_delay_seconds)
        with self._lock:
            self._finish_executing_locked(record, task_id, "Simulated task completion verified")
        return True

    # -- Recovery and views ----------------------------------------------

    def _resolve_vision_review(self, record: _OutcomeRecord, body: Mapping[str, Any], request_id: str) -> None:
        with self._lock:
            if not record.warehouse_workflow_id:
                raise OutcomeError("No package inspection is available.", "INSPECTION_NOT_FOUND", 404)
            workflow = self.warehouse.get_workflow(record.warehouse_workflow_id)
            inspection = workflow.get("vision_gate", {}).get("inspection") or workflow.get("inspection")
            inspection_id = (inspection or {}).get("id")
            if not inspection_id:
                raise OutcomeError("No package inspection is available.", "INSPECTION_NOT_FOUND", 404)
        parameters = dict(body.get("parameters") or {})
        review = {
            "reviewer_id": str(body.get("actor_id") or "human-inspector-demo"),
            "resolution": str(parameters.get("disposition") or "repackaged_and_cleared"),
            "overrides": dict(parameters.get("corrections") or {}),
            "notes": str(parameters.get("notes") or "Package repackaged and cleared for the dinner order."),
        }
        self.warehouse.review_inspection(inspection_id, review, f"{request_id}:vision-review")
        with self._lock:
            try:
                record.graph.recover("wh_vision", "Human inspection resolved package condition", evidence=[{"kind": "human_review", "actor_id": review["reviewer_id"], "notes": review["notes"]}])
            except TaskGraphError as exc:
                raise OutcomeError(str(exc), exc.code, 409) from exc
            record.attention = None
            record.status = "executing"
            record.phase = "warehouse_fulfillment"
            self._append_event(record, "vision.review_resolved", "Human review cleared the package gate", {"inspection_id": inspection_id})
            self._launch_locked(record)

    def _recover_task(self, record: _OutcomeRecord, body: Mapping[str, Any], action: str) -> None:
        target_id = str(body.get("target_id") or (record.attention or {}).get("task_id") or "")
        if not target_id:
            raise OutcomeError("A target task is required.", "INVALID_ACTION", 422)
        with self._lock:
            try:
                record.graph.recover(target_id, action, evidence=[{"kind": "human_action", "action": action, "actor_id": body.get("actor_id", "host-demo")}])
            except TaskGraphError as exc:
                raise OutcomeError(str(exc), exc.code, 409) from exc
            record.attention = None
            record.status = "executing"
            self._append_event(record, "task.recovered", f"{target_id} recovered with {action}", {"task_id": target_id, "action": action})
            self._launch_locked(record)

    def _warehouse_attention(self, record: _OutcomeRecord, message: str, code: str) -> None:
        with self._lock:
            status = self._status(record, "wh_vision")
            if status not in {"attention_required", "completed"}:
                try:
                    record.graph.require_attention("wh_vision", message, ["submit_vision_review", "retry_task", "cancel_outcome"], "vision")
                except TaskGraphError:
                    pass
            record.status = "attention_required"
            record.attention = {
                "id": f"attn_{uuid4().hex[:10]}",
                "severity": "warning",
                "code": code,
                "title": "Package needs review",
                "message": message,
                "task_id": "wh_vision",
                "affected_task_ids": ["wh_vision", "wh_pack", "wh_stage", "delivery_transit", "home_receive", "home_cook"],
                "continuing_task_ids": ["home_floors", "home_stage", "home_furniture", "home_lighting"],
                "blocking": True,
                "permitted_actions": ["submit_vision_review", "cancel_outcome"],
                "raised_at": utc_now(),
            }
            record.attention["affected_tasks"] = deepcopy(record.attention["affected_task_ids"])
            record.attention["continuing_tasks"] = deepcopy(record.attention["continuing_task_ids"])
            self._append_event(record, "outcome.attention_required", message, {"code": code, "task_id": "wh_vision"})

    def _set_executing_locked(self, record: _OutcomeRecord, task_id: str) -> None:
        status = self._status(record, task_id)
        task = record.graph.task(task_id)
        worker = task["metadata"]["proposed_worker_id"]
        if status == "ready":
            record.graph.reserve(task_id, worker)
            record.graph.start(task_id)
        elif status == "reserved":
            record.graph.start(task_id)

    def _finish_executing_locked(self, record: _OutcomeRecord, task_id: str, summary: str) -> None:
        status = self._status(record, task_id)
        if status == "completed":
            return
        if status == "executing":
            record.graph.begin_verification(task_id)
        evidence = {"id": f"ev_{uuid4().hex[:12]}", "kind": "task_verification", "task_id": task_id, "summary": summary, "recorded_at": utc_now()}
        record.graph.complete(task_id, [evidence])
        record.evidence.append(evidence)
        record.updated_at = utc_now()
        task = record.graph.task(task_id)
        self._append_event(record, "task.completed", f"{task['name']} completed", {"task_id": task_id, "evidence_id": evidence["id"]})

    def _execute_graph_task_locked(self, record: _OutcomeRecord, task_id: str, actor: str) -> None:
        self._set_executing_locked(record, task_id)
        self._finish_executing_locked(record, task_id, f"Confirmed by {actor}")

    def _handoff(self, record: _OutcomeRecord, from_worker: str, to_worker: str, object_id: str) -> None:
        with self._lock:
            evidence_id = f"ev_{uuid4().hex[:12]}"
            handoff = {
                "id": f"handoff_{uuid4().hex[:10]}",
                "object_id": object_id,
                "from_worker_id": from_worker,
                "to_worker_id": to_worker,
                "status": "accepted",
                "manifest_verified": True,
                "evidence_ids": [evidence_id],
                "occurred_at": utc_now(),
            }
            record.custody["current"][object_id] = to_worker
            record.custody["history"].append(handoff)
            self._append_event(record, "custody.accepted", f"{to_worker} accepted {object_id}", handoff)

    @staticmethod
    def _status(record: _OutcomeRecord, task_id: str) -> str:
        return str(record.graph.task(task_id)["status"])

    @staticmethod
    def _lane_view(lane: str, tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
        lane_tasks = [task for task in tasks if task["lane"] == lane]
        active = next((task for task in lane_tasks if task["status"] in {"executing", "verifying", "attention_required", "blocked"}), None)
        progress = round(sum(float(task["progress"]) for task in lane_tasks) * 100 / len(lane_tasks)) if lane_tasks else 0
        statuses = {task["status"] for task in lane_tasks}
        if "attention_required" in statuses:
            status = "attention_required"
        elif "executing" in statuses or "verifying" in statuses:
            status = "executing"
        elif statuses <= {"completed", "skipped"}:
            status = "completed"
        elif "ready" in statuses:
            status = "ready"
        else:
            status = "queued"
        return {
            "id": lane,
            "name": lane.title(),
            "status": status,
            "progress_percent": progress,
            "current_task_id": active["id"] if active else None,
            "blocked_by": deepcopy(active.get("blockers", [])) if active else [],
            "tasks": lane_tasks,
        }

    def _initial_routing(self, plan: Mapping[str, Any]) -> Dict[str, Any]:
        order = plan["order"]
        volume = float(order["estimated_volume_l"])
        refrigerated = bool(order["requires_refrigeration"])
        small_reasons: List[str] = []
        if volume > 45:
            small_reasons.append(f"Order volume {volume:g} L exceeds 45 L capacity")
        if refrigerated:
            small_reasons.append("Temperature-controlled delivery is required")
        return {
            "status": "selected",
            "label": "SIMULATED ROUTING",
            "selected_worker_id": "delivery-large-01",
            "selection_reason": "Large delivery worker satisfies volume and refrigeration constraints.",
            "eta": "5:50 PM",
            "candidates": [
                {"worker_id": "delivery-small-01", "name": "Small Delivery Robot", "eligible": not small_reasons, "selected": False, "reasons": small_reasons or ["Compatible"]},
                {"worker_id": "delivery-large-01", "name": "Large Delivery Robot", "eligible": True, "selected": True, "reasons": ["72 L capacity", "Temperature controlled", "Deadline compatible"]},
            ],
        }

    @staticmethod
    def _order_view(plan: Mapping[str, Any], record: _OutcomeRecord) -> Dict[str, Any]:
        order = deepcopy(plan["order"])
        order.update({"id": f"order-{record.id[-6:]}", "warehouse_id": "warehouse-01", "status": "in_progress" if record.status not in {"scheduled", "completed"} else record.status})
        order["items"] = order.pop("line_items")
        order["manifest"] = {
            "package_count": 3,
            "weight_kg": order["estimated_weight_kg"],
            "volume_l": order["estimated_volume_l"],
            "refrigeration_required": order["requires_refrigeration"],
            "handling": ["keep_upright", "temperature_controlled"],
        }
        return order

    @staticmethod
    def _readiness_view(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
        mapping = {
            "meal_ready": "home_cook",
            "places_for_12": "home_furniture",
            "room_clean": "home_floors",
            "dinner_lighting": "home_lighting",
            "order_reconciled": "home_receive",
            "final_verification": "home_verify",
        }
        statuses = {task["id"]: task["status"] for task in tasks}
        checks = [{"id": check, "label": check.replace("_", " ").title(), "status": "verified" if statuses.get(task_id) == "completed" else "pending"} for check, task_id in mapping.items()]
        return {"status": "ready" if all(item["status"] == "verified" for item in checks) else "preparing", "checks": checks}

    @staticmethod
    def _cleanup_view(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
        cleanup = [task for task in tasks if task["id"].startswith("cleanup_") and task["id"] != "cleanup_gate"]
        complete = bool(cleanup) and all(task["status"] == "completed" for task in cleanup)
        started = any(task["status"] not in {"queued", "ready"} for task in cleanup)
        checks = [
            {
                "id": task["id"],
                "label": task["name"],
                "status": "verified" if task["status"] == "completed" else "attention" if task["status"] in {"failed", "attention_required"} else "pending",
            }
            for task in cleanup
        ]
        return {"status": "completed" if complete else "in_progress" if started else "waiting_for_host", "trigger": "host_confirmation", "tasks": cleanup, "checks": checks}

    def _workers_view(self) -> List[Dict[str, Any]]:
        try:
            from .home import HomeWorkerRegistry

            home = HomeWorkerRegistry().snapshot()
            for worker in home:
                worker["capabilities"] = [
                    str(item.get("name"))
                    for item in worker.get("capabilities", [])
                    if isinstance(item, dict) and item.get("name")
                ]
                media = worker.get("media") or {}
                worker["video_url"] = media.get("video_url")
                reliability = worker.get("reliability") or {}
                worker.update(
                    {
                        "attempts": reliability.get("attempts", 0),
                        "completions": reliability.get("completions", 0),
                        "failures": reliability.get("failures", 0),
                        "intervention_rate": reliability.get("intervention_rate", 0),
                    }
                )
        except (ImportError, AttributeError):
            home = []
        return home + [
            {"id": "produce-picker-01", "name": "Produce Picker", "kind": "robot", "capabilities": ["pick_produce"], "execution_mode": "simulated"},
            {"id": "dry-goods-picker-01", "name": "Dry Goods Picker", "kind": "robot", "capabilities": ["pick_dry_goods"], "execution_mode": "simulated"},
            {"id": "cold-storage-picker-01", "name": "Cold Storage Picker", "kind": "robot", "capabilities": ["pick_cold_storage"], "execution_mode": "simulated"},
            {"id": "package-vision-01", "name": "Package Vision 01", "kind": "ai", "capabilities": ["inspect_package"], "execution_mode": "fixture"},
            {"id": "packing-arm-01", "name": "Packing Arm 01", "kind": "robot", "capabilities": ["pack_and_verify"], "execution_mode": "simulated"},
            {"id": "amr-01", "name": "Mobile Robot 01", "kind": "robot", "capabilities": ["move_package"], "execution_mode": "simulated"},
            {"id": "loading-station-01", "name": "Loading Station 01", "kind": "robot", "capabilities": ["load_vehicle"], "execution_mode": "simulated"},
            {"id": "delivery-small-01", "name": "Small Delivery Robot", "kind": "robot", "capabilities": ["last_mile_delivery"], "execution_mode": "simulated"},
            {"id": "delivery-large-01", "name": "Large Delivery Robot", "kind": "robot", "capabilities": ["last_mile_delivery", "temperature_controlled"], "execution_mode": "simulated"},
        ]

    @staticmethod
    def _public_task(task: Mapping[str, Any]) -> Dict[str, Any]:
        value = deepcopy(dict(task))
        value["lane_id"] = value.get("lane")
        value["title"] = value.get("name")
        value["progress_percent"] = round(float(value.get("progress") or 0) * 100)
        metadata = value.get("metadata") or {}
        value["assigned_worker_id"] = value.get("assigned_worker_id") or metadata.get("proposed_worker_id")
        value["blocked_by"] = [
            str(item.get("reason"))
            for item in value.get("blockers", [])
            if isinstance(item, dict) and item.get("active") and item.get("reason")
        ]
        value["evidence_ids"] = [
            str(item.get("id"))
            for item in value.get("evidence", [])
            if isinstance(item, dict) and item.get("id")
        ]
        value["current_action"] = value.get("name")
        return value

    def _permitted_actions(self, record: _OutcomeRecord) -> List[str]:
        if record.status == "attention_required":
            return list((record.attention or {}).get("permitted_actions") or ["retry_task", "cancel_outcome"])
        if record.status == "dinner_ready":
            return ["begin_cleanup", "keep_warm", "report_issue", "cancel_outcome"]
        if record.status in {"scheduled"}:
            return ["start_outcome", "cancel_outcome"]
        if record.status in {"executing", "cleaning_up"}:
            return ["cancel_outcome"]
        return []

    def _append_event(self, record: _OutcomeRecord, event_type: str, message: str, data: Mapping[str, Any]) -> None:
        sequence = self._sequence.get(record.id, 0) + 1
        self._sequence[record.id] = sequence
        self._events.setdefault(record.id, []).append(
            {"id": f"evt_{uuid4().hex[:12]}", "outcome_id": record.id, "sequence": sequence, "type": event_type, "message": message, "data": deepcopy(dict(data)), "occurred_at": utc_now()}
        )

    def _plan(self, plan_id: str) -> _PlanRecord:
        try:
            return self._plans[plan_id]
        except KeyError as exc:
            raise OutcomeError(f"Plan {plan_id} was not found.", "PLAN_NOT_FOUND", 404) from exc

    def _outcome(self, outcome_id: str) -> _OutcomeRecord:
        try:
            return self._outcomes[outcome_id]
        except KeyError as exc:
            raise OutcomeError(f"Outcome {outcome_id} was not found.", "OUTCOME_NOT_FOUND", 404) from exc

    @staticmethod
    def _fingerprint(payload: Mapping[str, Any]) -> str:
        value = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def _replay(self, operation: str, request_id: str, fingerprint: str) -> Optional[_IdempotencyEntry]:
        if not request_id:
            raise OutcomeError("request_id is required.", "INVALID_REQUEST", 422)
        with self._lock:
            entry = self._idempotency.get((operation, request_id))
            if not entry:
                self._replays[(operation, request_id)] = False
                return None
            if entry.fingerprint != fingerprint:
                raise OutcomeError("request_id was already used with different content.", "IDEMPOTENCY_CONFLICT", 409)
            self._replays[(operation, request_id)] = True
            return entry

    def _remember(self, operation: str, request_id: str, fingerprint: str, resource_type: str, resource_id: str) -> None:
        self._idempotency[(operation, request_id)] = _IdempotencyEntry(fingerprint, resource_type, resource_id)
        self._replays[(operation, request_id)] = False
