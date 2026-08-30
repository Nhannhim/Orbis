"""Thread-safe dependency graph primitives for outcome-level coordination.

The warehouse engine is intentionally linear.  This module supplies the more
general graph needed by an outcome that can make progress in several lanes at
once (for example Warehouse, Delivery, and Home).
"""

from dataclasses import dataclass, field
from enum import Enum
from threading import RLock
from typing import Any, Dict, Iterable, List, Mapping, Optional, Set
from uuid import uuid4

from .models import to_primitive, utc_now


class TaskGraphError(ValueError):
    """A deterministic graph or transition error suitable for API mapping."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class TaskStatus(str, Enum):
    QUEUED = "queued"
    READY = "ready"
    RESERVED = "reserved"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    ATTENTION_REQUIRED = "attention_required"
    BLOCKED = "blocked"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


TERMINAL_STATUSES = {
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.SKIPPED,
    TaskStatus.CANCELLED,
}
SUCCESS_STATUSES = {TaskStatus.COMPLETED, TaskStatus.SKIPPED}


@dataclass
class TaskBlocker:
    id: str
    reason: str
    source: str = "policy"
    recovery_actions: List[str] = field(default_factory=list)
    active: bool = True
    created_at: str = field(default_factory=utc_now)
    resolved_at: Optional[str] = None
    resolution: Optional[str] = None


@dataclass
class TaskNode:
    id: str
    name: str
    lane: str
    capability: str
    dependencies: List[str] = field(default_factory=list)
    weight: float = 1.0
    required: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.QUEUED
    assigned_worker_id: Optional[str] = None
    blockers: List[TaskBlocker] = field(default_factory=list)
    evidence: List[Dict[str, Any]] = field(default_factory=list)
    progress: float = 0.0
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def __post_init__(self) -> None:
        if self.weight <= 0:
            raise TaskGraphError("INVALID_TASK_WEIGHT", "Task weight must be greater than zero.")
        self.dependencies = list(dict.fromkeys(self.dependencies))


class TaskGraph:
    """Own task readiness, transitions, blockers, and progress for one outcome."""

    _PROGRESS_BY_STATUS = {
        TaskStatus.QUEUED: 0.0,
        TaskStatus.READY: 0.0,
        TaskStatus.RESERVED: 0.1,
        TaskStatus.EXECUTING: 0.5,
        TaskStatus.VERIFYING: 0.9,
        TaskStatus.COMPLETED: 1.0,
        TaskStatus.SKIPPED: 1.0,
        TaskStatus.FAILED: 0.0,
        TaskStatus.CANCELLED: 0.0,
    }

    def __init__(self, tasks: Iterable[TaskNode] = ()) -> None:
        self._lock = RLock()
        self._tasks: Dict[str, TaskNode] = {}
        for task in tasks:
            if task.id in self._tasks:
                raise TaskGraphError("DUPLICATE_TASK", f"Task {task.id} is already defined.")
            self._tasks[task.id] = task
        self._validate_graph()
        with self._lock:
            self._reconcile_locked()

    def add_task(self, task: TaskNode) -> Dict[str, Any]:
        with self._lock:
            if task.id in self._tasks:
                raise TaskGraphError("DUPLICATE_TASK", f"Task {task.id} is already defined.")
            self._tasks[task.id] = task
            try:
                self._validate_graph()
            except Exception:
                del self._tasks[task.id]
                raise
            self._reconcile_locked()
            return self._task_snapshot(task)

    def task(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            return self._task_snapshot(self._get(task_id))

    def ready_tasks(self, lane: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            self._reconcile_locked()
            return [
                self._task_snapshot(task)
                for task in self._tasks.values()
                if task.status == TaskStatus.READY and (lane is None or task.lane == lane)
            ]

    def reserve(self, task_id: str, worker_id: str) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_status(task, {TaskStatus.READY})
            task.assigned_worker_id = worker_id
            self._transition(task, TaskStatus.RESERVED)
            return self._task_snapshot(task)

    def start(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_status(task, {TaskStatus.RESERVED})
            task.started_at = task.started_at or utc_now()
            self._transition(task, TaskStatus.EXECUTING)
            return self._task_snapshot(task)

    def begin_verification(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_status(task, {TaskStatus.EXECUTING})
            self._transition(task, TaskStatus.VERIFYING)
            return self._task_snapshot(task)

    def complete(
        self, task_id: str, evidence: Optional[Iterable[Mapping[str, Any]]] = None
    ) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_status(task, {TaskStatus.EXECUTING, TaskStatus.VERIFYING})
            if evidence:
                task.evidence.extend(dict(item) for item in evidence)
            task.completed_at = utc_now()
            self._transition(task, TaskStatus.COMPLETED)
            self._reconcile_locked()
            return self._task_snapshot(task)

    def require_attention(
        self,
        task_id: str,
        reason: str,
        recovery_actions: Iterable[str] = (),
        source: str = "policy",
    ) -> Dict[str, Any]:
        return self._add_blocker(
            task_id,
            reason,
            recovery_actions,
            source,
            TaskStatus.ATTENTION_REQUIRED,
        )

    def block(
        self,
        task_id: str,
        reason: str,
        recovery_actions: Iterable[str] = (),
        source: str = "dependency",
    ) -> Dict[str, Any]:
        return self._add_blocker(
            task_id, reason, recovery_actions, source, TaskStatus.BLOCKED
        )

    def fail(
        self,
        task_id: str,
        reason: str,
        recovery_actions: Iterable[str] = ("retry_task",),
    ) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_active(task)
            blocker = self._new_blocker(reason, "execution", recovery_actions)
            task.blockers.append(blocker)
            self._transition(task, TaskStatus.FAILED, retain_progress=True)
            self._reconcile_locked()
            return self._task_snapshot(task)

    def skip(self, task_id: str, reason: str) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_active(task)
            task.metadata["skip_reason"] = reason
            self._resolve_all_blockers(task, f"Skipped: {reason}")
            task.completed_at = utc_now()
            self._transition(task, TaskStatus.SKIPPED)
            self._reconcile_locked()
            return self._task_snapshot(task)

    def cancel(self, task_id: str, reason: str) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_active(task)
            task.metadata["cancel_reason"] = reason
            self._resolve_all_blockers(task, f"Cancelled: {reason}")
            self._transition(task, TaskStatus.CANCELLED)
            self._reconcile_locked()
            return self._task_snapshot(task)

    def recover(
        self,
        task_id: str,
        resolution: str,
        blocker_id: Optional[str] = None,
        evidence: Optional[Iterable[Mapping[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Resolve blockers and return a recoverable task to dependency evaluation."""
        with self._lock:
            task = self._get(task_id)
            self._require_status(
                task,
                {
                    TaskStatus.ATTENTION_REQUIRED,
                    TaskStatus.BLOCKED,
                    TaskStatus.FAILED,
                },
            )
            matched = False
            for blocker in task.blockers:
                if blocker.active and (blocker_id is None or blocker.id == blocker_id):
                    blocker.active = False
                    blocker.resolved_at = utc_now()
                    blocker.resolution = resolution
                    matched = True
            if not matched:
                raise TaskGraphError("BLOCKER_NOT_FOUND", "No matching active blocker was found.")
            if evidence:
                task.evidence.extend(dict(item) for item in evidence)
            if not any(blocker.active for blocker in task.blockers):
                task.assigned_worker_id = None
                task.status = TaskStatus.QUEUED
                task.updated_at = utc_now()
            self._reconcile_locked()
            return self._task_snapshot(task)

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            self._reconcile_locked()
            tasks = [self._task_snapshot(task) for task in self._tasks.values()]
            active_blockers = [
                {
                    "task_id": task.id,
                    **to_primitive(blocker),
                }
                for task in self._tasks.values()
                for blocker in task.blockers
                if blocker.active
            ]
            required = [task for task in self._tasks.values() if task.required]
            return {
                "tasks": tasks,
                "ready_task_ids": [
                    task.id for task in self._tasks.values() if task.status == TaskStatus.READY
                ],
                "active_blockers": active_blockers,
                "progress": self._weighted_progress(required),
                "completed": bool(required)
                and all(task.status in SUCCESS_STATUSES for task in required),
            }

    def _add_blocker(
        self,
        task_id: str,
        reason: str,
        recovery_actions: Iterable[str],
        source: str,
        status: TaskStatus,
    ) -> Dict[str, Any]:
        with self._lock:
            task = self._get(task_id)
            self._require_active(task)
            task.blockers.append(self._new_blocker(reason, source, recovery_actions))
            self._transition(task, status, retain_progress=True)
            return self._task_snapshot(task)

    @staticmethod
    def _new_blocker(
        reason: str, source: str, recovery_actions: Iterable[str]
    ) -> TaskBlocker:
        return TaskBlocker(
            id=f"blk_{uuid4().hex[:12]}",
            reason=reason,
            source=source,
            recovery_actions=list(dict.fromkeys(recovery_actions)),
        )

    def _reconcile_locked(self) -> None:
        # A failed dependency can itself be recovered. Resolve only the blocker
        # created for that dependency while preserving unrelated policy blocks.
        for task in self._tasks.values():
            if task.status != TaskStatus.BLOCKED:
                continue
            for blocker in task.blockers:
                if not blocker.active or not blocker.source.startswith("dependency:"):
                    continue
                dependency_id = blocker.source.split(":", 1)[1]
                dependency = self._tasks[dependency_id]
                if dependency.status not in {TaskStatus.FAILED, TaskStatus.CANCELLED}:
                    blocker.active = False
                    blocker.resolved_at = utc_now()
                    blocker.resolution = "Dependency recovered."
            if not any(blocker.active for blocker in task.blockers):
                task.status = TaskStatus.QUEUED
                task.updated_at = utc_now()

        for task in self._tasks.values():
            if task.status != TaskStatus.QUEUED:
                continue
            dependencies = [self._tasks[item] for item in task.dependencies]
            failed = [
                item
                for item in dependencies
                if item.status in {TaskStatus.FAILED, TaskStatus.CANCELLED}
            ]
            if failed:
                existing_sources = {
                    blocker.source for blocker in task.blockers if blocker.active
                }
                for dependency in failed:
                    source = f"dependency:{dependency.id}"
                    if source not in existing_sources:
                        task.blockers.append(
                            self._new_blocker(
                                f"Dependency {dependency.name} did not complete.",
                                source,
                                ["retry_dependency", "skip_task", "cancel_outcome"],
                            )
                        )
                self._transition(task, TaskStatus.BLOCKED, retain_progress=True)
            elif all(item.status in SUCCESS_STATUSES for item in dependencies):
                self._transition(task, TaskStatus.READY)

    @staticmethod
    def _resolve_all_blockers(task: TaskNode, resolution: str) -> None:
        resolved_at = utc_now()
        for blocker in task.blockers:
            if blocker.active:
                blocker.active = False
                blocker.resolved_at = resolved_at
                blocker.resolution = resolution

    def _weighted_progress(self, tasks: List[TaskNode]) -> int:
        total_weight = sum(task.weight for task in tasks)
        if not total_weight:
            return 0
        completed_weight = sum(task.weight * task.progress for task in tasks)
        return round(100 * completed_weight / total_weight)

    def _transition(
        self, task: TaskNode, status: TaskStatus, retain_progress: bool = False
    ) -> None:
        task.status = status
        if not retain_progress:
            task.progress = self._PROGRESS_BY_STATUS.get(status, task.progress)
        task.updated_at = utc_now()

    def _task_snapshot(self, task: TaskNode) -> Dict[str, Any]:
        return to_primitive(task)

    def _get(self, task_id: str) -> TaskNode:
        try:
            return self._tasks[task_id]
        except KeyError as exc:
            raise TaskGraphError("TASK_NOT_FOUND", f"Task {task_id} was not found.") from exc

    @staticmethod
    def _require_active(task: TaskNode) -> None:
        if task.status in TERMINAL_STATUSES:
            raise TaskGraphError(
                "INVALID_TASK_TRANSITION",
                f"Task {task.id} cannot transition from {task.status.value}.",
            )

    @staticmethod
    def _require_status(task: TaskNode, statuses: Set[TaskStatus]) -> None:
        if task.status not in statuses:
            allowed = ", ".join(sorted(item.value for item in statuses))
            raise TaskGraphError(
                "INVALID_TASK_TRANSITION",
                f"Task {task.id} is {task.status.value}; expected one of: {allowed}.",
            )

    def _validate_graph(self) -> None:
        for task in self._tasks.values():
            if task.id in task.dependencies:
                raise TaskGraphError("TASK_CYCLE", f"Task {task.id} cannot depend on itself.")
            missing = [item for item in task.dependencies if item not in self._tasks]
            if missing:
                raise TaskGraphError(
                    "UNKNOWN_DEPENDENCY",
                    f"Task {task.id} has unknown dependencies: {', '.join(missing)}.",
                )

        visiting: Set[str] = set()
        visited: Set[str] = set()

        def visit(task_id: str) -> None:
            if task_id in visiting:
                raise TaskGraphError("TASK_CYCLE", "The task graph contains a dependency cycle.")
            if task_id in visited:
                return
            visiting.add(task_id)
            for dependency_id in self._tasks[task_id].dependencies:
                visit(dependency_id)
            visiting.remove(task_id)
            visited.add(task_id)

        for task_id in self._tasks:
            visit(task_id)
