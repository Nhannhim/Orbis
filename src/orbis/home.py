"""Home-worker contracts and deterministic simulated worker registry."""

from dataclasses import dataclass, field
from enum import Enum
from threading import RLock
from typing import Any, Dict, Iterable, List, Mapping, Optional
from uuid import uuid4

from .models import Capability, to_primitive, utc_now


class HomeWorkerError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class HomeWorkerStatus(str, Enum):
    AVAILABLE = "available"
    RESERVED = "reserved"
    WORKING = "working"
    WAITING = "waiting"
    VERIFYING = "verifying"
    ATTENTION = "attention"
    OFFLINE = "offline"


@dataclass(frozen=True)
class HomeEvidence:
    """Evidence emitted by a Home worker.

    Robot telemetry and deterministic attestations intentionally have no
    confidence score.  Confidence is only accepted for an actual model result.
    """

    id: str
    worker_id: str
    task_id: str
    kind: str
    passed: bool
    observations: Dict[str, Any]
    source: str = "robot_telemetry"
    confidence: Optional[float] = None
    captured_at: str = field(default_factory=utc_now)

    def __post_init__(self) -> None:
        if self.source != "model" and self.confidence is not None:
            raise HomeWorkerError(
                "INVALID_EVIDENCE_CONFIDENCE",
                "Only model-produced evidence may include a confidence score.",
            )
        if self.confidence is not None and not 0 <= self.confidence <= 1:
            raise HomeWorkerError(
                "INVALID_EVIDENCE_CONFIDENCE",
                "Evidence confidence must be between zero and one.",
            )


@dataclass
class WorkerReliability:
    attempts: int = 0
    completions: int = 0
    failures: int = 0
    human_interventions: int = 0

    def snapshot(self) -> Dict[str, Any]:
        denominator = self.attempts or 1
        return {
            "attempts": self.attempts,
            "completions": self.completions,
            "failures": self.failures,
            "human_interventions": self.human_interventions,
            "success_rate": round(self.completions / denominator, 4),
            "failure_rate": round(self.failures / denominator, 4),
            "intervention_rate": round(self.human_interventions / denominator, 4),
        }


class HomeWorker:
    """Thread-safe stateful simulator for a physical Home worker."""

    def __init__(
        self,
        worker_id: str,
        name: str,
        subtype: str,
        location: str,
        capabilities: Iterable[Capability],
        video_url: str,
        evidence_kinds: Iterable[str],
        protocol: str = "orbis-home-sim-v1",
    ) -> None:
        self.id = worker_id
        self.name = name
        self.kind = "robot"
        self.subtype = subtype
        self.location = location
        self.protocol = protocol
        self.capabilities = {item.name: item for item in capabilities}
        self.video_url = video_url
        self.poster_url = "/images/orbis-home-dinner-reset.jpg"
        self.evidence_kinds = list(evidence_kinds)
        self.health = "online"
        self.status = HomeWorkerStatus.AVAILABLE
        self.active_task_id: Optional[str] = None
        self.reliability = WorkerReliability()
        self._evidence: List[HomeEvidence] = []
        self._lock = RLock()

    def can_execute(self, capability: str) -> bool:
        with self._lock:
            return (
                self.health == "online"
                and self.status == HomeWorkerStatus.AVAILABLE
                and capability in self.capabilities
            )

    def reserve(self, task_id: str, capability: str) -> Dict[str, Any]:
        with self._lock:
            if capability not in self.capabilities:
                raise HomeWorkerError(
                    "CAPABILITY_NOT_SUPPORTED",
                    f"{self.name} does not support {capability}.",
                )
            if not self.can_execute(capability):
                raise HomeWorkerError("WORKER_UNAVAILABLE", f"{self.name} is unavailable.")
            self.active_task_id = task_id
            self.status = HomeWorkerStatus.RESERVED
            return self.snapshot()

    def start(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            self._require_assignment(task_id, {HomeWorkerStatus.RESERVED})
            self.status = HomeWorkerStatus.WORKING
            self.reliability.attempts += 1
            return self.snapshot()

    def wait(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            self._require_assignment(
                task_id, {HomeWorkerStatus.RESERVED, HomeWorkerStatus.WORKING}
            )
            self.status = HomeWorkerStatus.WAITING
            return self.snapshot()

    def resume(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            self._require_assignment(task_id, {HomeWorkerStatus.WAITING})
            self.status = HomeWorkerStatus.WORKING
            return self.snapshot()

    def begin_verification(self, task_id: str) -> Dict[str, Any]:
        with self._lock:
            self._require_assignment(task_id, {HomeWorkerStatus.WORKING})
            self.status = HomeWorkerStatus.VERIFYING
            return self.snapshot()

    def complete(
        self,
        task_id: str,
        observations: Mapping[str, Any],
        kind: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            self._require_assignment(
                task_id, {HomeWorkerStatus.WORKING, HomeWorkerStatus.VERIFYING}
            )
            evidence = self._record_evidence(
                task_id,
                kind or self.evidence_kinds[0],
                True,
                observations,
            )
            self.reliability.completions += 1
            self._release_locked()
            return to_primitive(evidence)

    def fail(
        self,
        task_id: str,
        reason: str,
        observations: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            self._require_assignment(
                task_id,
                {
                    HomeWorkerStatus.RESERVED,
                    HomeWorkerStatus.WORKING,
                    HomeWorkerStatus.WAITING,
                    HomeWorkerStatus.VERIFYING,
                },
            )
            details = dict(observations or {})
            details["reason"] = reason
            if self.status == HomeWorkerStatus.RESERVED:
                self.reliability.attempts += 1
            evidence = self._record_evidence(
                task_id, self.evidence_kinds[0], False, details
            )
            self.reliability.failures += 1
            self.status = HomeWorkerStatus.ATTENTION
            return to_primitive(evidence)

    def recover(self, task_id: str, resolution: str, actor_id: str) -> Dict[str, Any]:
        """Record the workaround and return an attention task to reservation."""
        with self._lock:
            self._require_assignment(task_id, {HomeWorkerStatus.ATTENTION})
            self.reliability.human_interventions += 1
            self._record_evidence(
                task_id,
                "human_intervention",
                True,
                {"action": resolution, "actor_id": actor_id},
                source="human_attestation",
            )
            self.status = HomeWorkerStatus.RESERVED
            return self.snapshot()

    def record_human_intervention(
        self, task_id: str, action: str, actor_id: str
    ) -> Dict[str, Any]:
        with self._lock:
            if self.active_task_id != task_id:
                raise HomeWorkerError(
                    "ASSIGNMENT_MISMATCH", f"{self.name} is not assigned to {task_id}."
                )
            self.reliability.human_interventions += 1
            evidence = self._record_evidence(
                task_id,
                "human_intervention",
                True,
                {"action": action, "actor_id": actor_id},
                source="human_attestation",
            )
            return to_primitive(evidence)

    def release(self) -> Dict[str, Any]:
        with self._lock:
            self._release_locked()
            return self.snapshot()

    def set_online(self, online: bool) -> Dict[str, Any]:
        with self._lock:
            if not online and self.active_task_id is not None:
                raise HomeWorkerError(
                    "ACTIVE_ASSIGNMENT", "An assigned worker cannot be taken offline."
                )
            self.health = "online" if online else "offline"
            self.status = (
                HomeWorkerStatus.AVAILABLE if online else HomeWorkerStatus.OFFLINE
            )
            return self.snapshot()

    def evidence(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [to_primitive(item) for item in self._evidence]

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "id": self.id,
                "name": self.name,
                "kind": self.kind,
                "subtype": self.subtype,
                "protocol": self.protocol,
                "location": self.location,
                "health": self.health,
                "status": self.status.value,
                "active_assignment": self.active_task_id,
                "capabilities": [
                    to_primitive(item) for item in self.capabilities.values()
                ],
                "media": {
                    "video_url": self.video_url,
                    "poster_url": self.poster_url,
                    "label": "SIMULATED FEED",
                },
                "evidence_kinds": list(self.evidence_kinds),
                "reliability": self.reliability.snapshot(),
                "evidence_count": len(self._evidence),
                "latest_evidence": (
                    to_primitive(self._evidence[-1]) if self._evidence else None
                ),
            }

    def _record_evidence(
        self,
        task_id: str,
        kind: str,
        passed: bool,
        observations: Mapping[str, Any],
        source: str = "robot_telemetry",
    ) -> HomeEvidence:
        evidence = HomeEvidence(
            id=f"ev_home_{uuid4().hex[:12]}",
            worker_id=self.id,
            task_id=task_id,
            kind=kind,
            passed=passed,
            observations=dict(observations),
            source=source,
            confidence=None,
        )
        self._evidence.append(evidence)
        return evidence

    def _release_locked(self) -> None:
        self.active_task_id = None
        self.status = (
            HomeWorkerStatus.AVAILABLE
            if self.health == "online"
            else HomeWorkerStatus.OFFLINE
        )

    def _require_assignment(
        self, task_id: str, statuses: Iterable[HomeWorkerStatus]
    ) -> None:
        valid = set(statuses)
        if self.active_task_id != task_id:
            raise HomeWorkerError(
                "ASSIGNMENT_MISMATCH", f"{self.name} is not assigned to {task_id}."
            )
        if self.status not in valid:
            raise HomeWorkerError(
                "INVALID_WORKER_TRANSITION",
                f"{self.name} cannot act while {self.status.value}.",
            )


class HomeWorkerRegistry:
    def __init__(self, workers: Optional[Iterable[HomeWorker]] = None) -> None:
        worker_list = list(workers or home_workers())
        self._workers = {worker.id: worker for worker in worker_list}
        if len(self._workers) != len(worker_list):
            raise HomeWorkerError("DUPLICATE_WORKER", "Home worker IDs must be unique.")
        self._lock = RLock()

    def get(self, worker_id: str) -> HomeWorker:
        with self._lock:
            try:
                return self._workers[worker_id]
            except KeyError as exc:
                raise HomeWorkerError(
                    "WORKER_NOT_FOUND", f"Home worker {worker_id} was not found."
                ) from exc

    def eligible(self, capability: str) -> List[Dict[str, Any]]:
        with self._lock:
            return [
                worker.snapshot()
                for worker in self._workers.values()
                if worker.can_execute(capability)
            ]

    def reserve(
        self, task_id: str, capability: str, worker_id: Optional[str] = None
    ) -> Dict[str, Any]:
        with self._lock:
            candidates = (
                [self.get(worker_id)]
                if worker_id is not None
                else list(self._workers.values())
            )
            for worker in candidates:
                if worker.can_execute(capability):
                    return worker.reserve(task_id, capability)
            raise HomeWorkerError(
                "NO_ELIGIBLE_WORKER", f"No available Home worker supports {capability}."
            )

    def snapshot(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [worker.snapshot() for worker in self._workers.values()]


def home_workers() -> List[HomeWorker]:
    """Return the five locked Home demo workers with deterministic capabilities."""
    return [
        HomeWorker(
            "home-roomba-01",
            "Roomba",
            "floor_cleaning_robot",
            "home:dining_area",
            [
                Capability("clean_floor", "Vacuum approved kitchen and dining zones"),
                Capability("verify_coverage", "Report deterministic cleaning coverage"),
            ],
            "/videos/home-cleanliness.mp4",
            ["cleaning_coverage"],
        ),
        HomeWorker(
            "home-humanoid-cook-01",
            "Humanoid Cook",
            "humanoid_cooking_robot",
            "home:kitchen",
            [
                Capability("prepare_food", "Prepare approved ingredients"),
                Capability("cook_meal", "Cook the approved meal within safety policy"),
                Capability("plate_meal", "Plate and stage the completed meal"),
                Capability("store_leftovers", "Store leftovers after dinner"),
            ],
            "/videos/home-decoration.mp4",
            ["recipe_execution", "appliance_state"],
        ),
        HomeWorker(
            "home-loader-01",
            "Loader Robot",
            "home_loader_robot",
            "home:service_area",
            [
                Capability("clear_surfaces", "Clear approved kitchen and dining surfaces"),
                Capability("stage_kitchen", "Stage cookware and serving supplies"),
                Capability("receive_delivery", "Accept and reconcile grocery custody"),
                Capability("transport_items", "Move groceries and meal items inside the home"),
                Capability("clean_surfaces", "Clean approved surfaces after dinner"),
            ],
            "/videos/home-table-tasks.mp4",
            ["object_transfer", "surface_state", "manifest_reconciliation"],
        ),
        HomeWorker(
            "home-furniture-01",
            "Furniture Robot",
            "furniture_robot",
            "home:dining_area",
            [
                Capability("configure_table", "Position the dining table safely"),
                Capability("position_chairs", "Place twelve chairs with safe clearances"),
                Capability("restore_layout", "Restore the normal room layout"),
            ],
            "/videos/home-layout.mp4",
            ["layout_verification", "clearance_check"],
        ),
        HomeWorker(
            "home-lamp-agent-01",
            "Lamp Agent",
            "lighting_agent_robot",
            "home:lighting_network",
            [
                Capability("set_preparation_lighting", "Set safe preparation lighting"),
                Capability("set_dinner_lighting", "Apply the approved dinner scene"),
                Capability("set_cleanup_lighting", "Set safe cleanup lighting"),
                Capability("restore_lighting", "Restore the normal evening scene"),
            ],
            "/videos/home-lights.mp4",
            ["device_state"],
        ),
    ]
