"""Physical-agent interface and deterministic warehouse simulators."""

from threading import RLock
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from .models import (
    AgentStatus,
    Capability,
    Evidence,
    ExecutionResult,
    PackageState,
    WorkflowStep,
    to_primitive,
)


class PhysicalAgent:
    """A small reference implementation of the Orbis physical-agent contract.

    Hardware vendors would implement this interface in an edge adapter. Safety
    and real-time motion remain local to the machine controller.
    """

    def __init__(
        self,
        agent_id: str,
        name: str,
        agent_type: str,
        location: str,
        capabilities: Iterable[Capability],
    ) -> None:
        self.id = agent_id
        self.name = name
        self.agent_type = agent_type
        self.location = location
        self.capabilities = {capability.name: capability for capability in capabilities}
        self.status = AgentStatus.AVAILABLE
        self.active_step_id: Optional[str] = None
        self._fail_next: Optional[str] = None
        self._lock = RLock()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "id": self.id,
                "name": self.name,
                "agent_type": self.agent_type,
                "location": self.location,
                "status": self.status.value,
                "active_step_id": self.active_step_id,
                "capabilities": [to_primitive(item) for item in self.capabilities.values()],
            }

    def can_execute(self, capability: str) -> bool:
        with self._lock:
            return capability in self.capabilities and self.status == AgentStatus.AVAILABLE

    def reserve(self, step_id: str) -> bool:
        with self._lock:
            if self.status != AgentStatus.AVAILABLE:
                return False
            self.status = AgentStatus.RESERVED
            self.active_step_id = step_id
            return True

    def inject_failure(self, capability: Optional[str] = None) -> None:
        with self._lock:
            self._fail_next = capability or "*"

    def execute(self, step: WorkflowStep, package: PackageState) -> ExecutionResult:
        with self._lock:
            if self.status != AgentStatus.RESERVED or self.active_step_id != step.id:
                raise RuntimeError(f"Agent {self.id} has not reserved step {step.id}")
            self.status = AgentStatus.EXECUTING
            should_fail = self._fail_next in ("*", step.capability)
            if should_fail:
                self._fail_next = None

        if should_fail:
            result = self._failure_result(step, package)
        else:
            result = self._execute_action(step, package)

        return result

    def release(self) -> None:
        with self._lock:
            self.status = AgentStatus.AVAILABLE
            self.active_step_id = None

    def _evidence(
        self,
        kind: str,
        passed: bool,
        confidence: float,
        observations: Dict[str, Any],
    ) -> Evidence:
        return Evidence(
            id=f"ev_{uuid4().hex[:12]}",
            producer_id=self.id,
            kind=kind,
            passed=passed,
            confidence=confidence,
            observations=observations,
        )

    def _failure_result(self, step: WorkflowStep, package: PackageState) -> ExecutionResult:
        evidence = self._evidence(
            "vision_verification",
            False,
            0.41,
            {
                "object_id": package.id,
                "expected_action": step.capability,
                "verified": False,
                "reason": "simulated visual mismatch",
            },
        )
        return ExecutionResult(
            success=False,
            evidence=[evidence],
            location=package.location,
            package_status=package.status,
            error_code="VERIFICATION_FAILED",
            message="The edge agent could not prove the expected physical outcome.",
            retryable=True,
        )

    def _execute_action(self, step: WorkflowStep, package: PackageState) -> ExecutionResult:
        raise NotImplementedError


class PackingArmAgent(PhysicalAgent):
    def _execute_action(self, step: WorkflowStep, package: PackageState) -> ExecutionResult:
        evidence = self._evidence(
            "vision_verification",
            True,
            0.99,
            {
                "object_id": package.id,
                "seal_intact": True,
                "label_legible": True,
                "order_match": True,
            },
        )
        return ExecutionResult(True, [evidence], self.location, "packed")


class MobileRobotAgent(PhysicalAgent):
    def _execute_action(self, step: WorkflowStep, package: PackageState) -> ExecutionResult:
        target = str(step.payload.get("target_location", "staging_lane"))
        evidence = self._evidence(
            "navigation_and_identity_verification",
            True,
            0.97,
            {
                "object_id": package.id,
                "pickup_identity_match": True,
                "route_clear": True,
                "delivered_to": target,
            },
        )
        self.location = target
        return ExecutionResult(True, [evidence], target, "staged")


class LoadingStationAgent(PhysicalAgent):
    def _execute_action(self, step: WorkflowStep, package: PackageState) -> ExecutionResult:
        trailer_id = str(step.payload.get("trailer_id", "truck-17"))
        location = f"{trailer_id}:cargo_bay"
        evidence = self._evidence(
            "vision_and_load_verification",
            True,
            0.98,
            {
                "object_id": package.id,
                "vehicle_identity_match": True,
                "inside_cargo_area": True,
                "restraint_check": "passed",
                "trailer_id": trailer_id,
            },
        )
        return ExecutionResult(True, [evidence], location, "loaded")


def warehouse_agents() -> List[PhysicalAgent]:
    return [
        PackingArmAgent(
            "packing-arm-01",
            "Packing Arm 01",
            "robotic_arm",
            "packing_cell",
            [Capability("pack_and_verify", "Seal, label, and visually verify a parcel", {"max_kg": 20})],
        ),
        MobileRobotAgent(
            "amr-01",
            "Mobile Robot 01",
            "autonomous_mobile_robot",
            "charging_zone",
            [Capability("move_package", "Move a verified parcel between warehouse zones", {"max_kg": 35})],
        ),
        LoadingStationAgent(
            "loading-station-01",
            "Loading Station 01",
            "robotic_loader",
            "dock_4",
            [Capability("load_vehicle", "Load and visually verify cargo in an identified vehicle", {"dock": 4})],
        ),
    ]

