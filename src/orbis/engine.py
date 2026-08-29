"""In-memory workflow engine for proof-grounded physical handoffs."""

import time
from threading import RLock, Thread
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .agents import PhysicalAgent, warehouse_agents
from .models import (
    Event,
    Handoff,
    HandoffStatus,
    PackageState,
    StepStatus,
    Workflow,
    WorkflowStatus,
    WorkflowStep,
    to_primitive,
    utc_now,
)


class OrchestrationError(RuntimeError):
    pass


class Orchestrator:
    def __init__(self, step_delay: float = 0.45) -> None:
        self.agents: Dict[str, PhysicalAgent] = {}
        self.workflows: Dict[str, Workflow] = {}
        self.packages: Dict[str, PackageState] = {}
        self.step_delay = step_delay
        self._running: Dict[str, Thread] = {}
        self._lock = RLock()

    def register_agent(self, agent: PhysicalAgent) -> None:
        with self._lock:
            if agent.id in self.agents:
                raise OrchestrationError(f"Agent already registered: {agent.id}")
            self.agents[agent.id] = agent

    def create_warehouse_workflow(
        self,
        order_id: str,
        package_id: str,
        destination: str,
        trailer_id: str = "truck-17",
    ) -> Workflow:
        if not order_id or not package_id or not destination:
            raise OrchestrationError("order_id, package_id, and destination are required")

        workflow_id = f"wf_{uuid4().hex[:10]}"
        steps = [
            WorkflowStep(
                id=f"step_{uuid4().hex[:10]}",
                name="Pack and verify",
                capability="pack_and_verify",
                description="Seal the parcel and prove that its label matches the order.",
                preconditions=["package.registered", "packing_cell.ready"],
                payload={"package_id": package_id, "order_id": order_id},
            ),
            WorkflowStep(
                id=f"step_{uuid4().hex[:10]}",
                name="Move to outbound staging",
                capability="move_package",
                description="Accept custody and move the parcel to the outbound dock.",
                preconditions=["previous_step.verified", "handoff.accepted", "route.safe"],
                payload={"package_id": package_id, "target_location": "dock_4_staging"},
            ),
            WorkflowStep(
                id=f"step_{uuid4().hex[:10]}",
                name="Load vehicle",
                capability="load_vehicle",
                description="Accept custody, load the parcel, and prove placement in the vehicle.",
                preconditions=["previous_step.verified", "handoff.accepted", "vehicle.identity_verified"],
                payload={"package_id": package_id, "trailer_id": trailer_id},
            ),
        ]
        workflow = Workflow(workflow_id, order_id, package_id, destination, steps)
        package = PackageState(
            id=package_id,
            order_id=order_id,
            status="registered",
            location="packing_cell",
            custodian_id="warehouse-control",
            destination=destination,
        )
        with self._lock:
            if package_id in self.packages:
                raise OrchestrationError(f"Package already exists: {package_id}")
            self.workflows[workflow_id] = workflow
            self.packages[package_id] = package
            self._event(workflow, "workflow.created", "Warehouse fulfillment workflow created")
        return workflow

    def inject_failure(self, agent_id: str, capability: Optional[str] = None) -> None:
        agent = self.agents.get(agent_id)
        if not agent:
            raise OrchestrationError(f"Unknown agent: {agent_id}")
        agent.inject_failure(capability)

    def start(self, workflow_id: str) -> None:
        with self._lock:
            workflow = self._workflow(workflow_id)
            if workflow.status != WorkflowStatus.PENDING:
                raise OrchestrationError(f"Workflow cannot start from {workflow.status.value}")
            running = self._running.get(workflow_id)
            if running and running.is_alive():
                raise OrchestrationError("Workflow is already running")
            thread = Thread(target=self.run, args=(workflow_id,), daemon=True)
            self._running[workflow_id] = thread
            thread.start()

    def retry(self, workflow_id: str) -> None:
        with self._lock:
            workflow = self._workflow(workflow_id)
            if workflow.status != WorkflowStatus.ATTENTION_REQUIRED:
                raise OrchestrationError("Only an attention-required workflow can be retried")
            step = workflow.steps[workflow.current_step_index]
            if step.status != StepStatus.FAILED:
                raise OrchestrationError("The current step is not failed")
            step.status = StepStatus.PENDING
            step.error = None
            step.started_at = None
            step.completed_at = None
            workflow.status = WorkflowStatus.PENDING
            workflow.updated_at = utc_now()
            self._event(workflow, "workflow.retry_requested", f"Retry requested for {step.name}")
        self.start(workflow_id)

    def run(self, workflow_id: str) -> Workflow:
        with self._lock:
            workflow = self._workflow(workflow_id)
            workflow.status = WorkflowStatus.RUNNING
            workflow.updated_at = utc_now()
            self._event(workflow, "workflow.started", "Orchestrator started execution")

        while True:
            with self._lock:
                workflow = self._workflow(workflow_id)
                if workflow.current_step_index >= len(workflow.steps):
                    workflow.status = WorkflowStatus.COMPLETED
                    workflow.updated_at = utc_now()
                    self._event(workflow, "workflow.completed", "Package is loaded and ready for transport")
                    return workflow
                step = workflow.steps[workflow.current_step_index]

            if not self._run_step(workflow, step):
                return workflow

            with self._lock:
                workflow.current_step_index += 1
                workflow.updated_at = utc_now()

    def _run_step(self, workflow: Workflow, step: WorkflowStep) -> bool:
        with self._lock:
            agent = self._select_agent(step.capability)
            if not agent:
                self._fail_without_agent(workflow, step)
                return False
            if not agent.reserve(step.id):
                self._fail_without_agent(workflow, step)
                return False
            step.assigned_agent_id = agent.id
            step.status = StepStatus.RESERVED
            step.attempt += 1
            self._event(
                workflow,
                "step.reserved",
                f"{agent.name} reserved {step.name}",
                {"step_id": step.id, "agent_id": agent.id, "attempt": step.attempt},
            )
            self._accept_handoff(workflow, step, agent)

        self._pause()
        with self._lock:
            step.status = StepStatus.EXECUTING
            step.started_at = utc_now()
            self._event(workflow, "step.executing", f"{agent.name} is executing {step.name}")

        self._pause()
        package = self.packages[workflow.package_id]
        try:
            result = agent.execute(step, package)
        except Exception as exc:
            agent.release()
            with self._lock:
                step.status = StepStatus.FAILED
                step.error = {"code": "AGENT_ERROR", "message": str(exc), "retryable": True}
                workflow.status = WorkflowStatus.ATTENTION_REQUIRED
                self._event(workflow, "step.failed", f"{step.name} failed inside the edge agent")
            return False

        with self._lock:
            step.status = StepStatus.VERIFYING
            step.evidence.extend(result.evidence)
            self._event(
                workflow,
                "step.verifying",
                f"Validating {len(result.evidence)} evidence record(s) from {agent.name}",
            )

        self._pause()
        verified = result.success and bool(result.evidence) and all(
            evidence.passed and evidence.confidence >= 0.90 for evidence in result.evidence
        )

        with self._lock:
            if not verified:
                step.status = StepStatus.FAILED
                step.error = {
                    "code": result.error_code or "EVIDENCE_REJECTED",
                    "message": result.message or "Evidence did not satisfy the workflow policy.",
                    "retryable": result.retryable,
                }
                workflow.status = WorkflowStatus.ATTENTION_REQUIRED
                workflow.updated_at = utc_now()
                self._event(
                    workflow,
                    "step.failed",
                    f"{step.name} stopped: physical outcome was not verified",
                    {"step_id": step.id, "error": step.error},
                )
                agent.release()
                return False

            package.status = result.package_status
            package.location = result.location
            package.custodian_id = agent.id
            package.version += 1
            package.updated_at = utc_now()
            step.status = StepStatus.COMPLETED
            step.completed_at = utc_now()
            workflow.updated_at = utc_now()
            self._event(
                workflow,
                "step.completed",
                f"{step.name} completed with verified evidence",
                {
                    "step_id": step.id,
                    "agent_id": agent.id,
                    "evidence_ids": [item.id for item in result.evidence],
                    "package_version": package.version,
                },
            )
            agent.release()
            return True

    def _accept_handoff(self, workflow: Workflow, step: WorkflowStep, agent: PhysicalAgent) -> None:
        package = self.packages[workflow.package_id]
        if workflow.current_step_index == 0:
            package.custodian_id = agent.id
            package.version += 1
            package.updated_at = utc_now()
            self._event(
                workflow,
                "custody.assigned",
                f"Initial custody assigned to {agent.name}",
                {"object_id": package.id, "to_agent_id": agent.id},
            )
            return

        previous_step = workflow.steps[workflow.current_step_index - 1]
        evidence_ids = [evidence.id for evidence in previous_step.evidence if evidence.passed]
        if not evidence_ids:
            raise OrchestrationError("A handoff requires verified evidence from the previous step")
        handoff = Handoff(
            id=f"ho_{uuid4().hex[:10]}",
            object_id=package.id,
            from_agent_id=package.custodian_id,
            to_agent_id=agent.id,
            workflow_id=workflow.id,
            from_step_id=previous_step.id,
            to_step_id=step.id,
            evidence_ids=evidence_ids,
        )
        workflow.handoffs.append(handoff)
        self._event(
            workflow,
            "handoff.offered",
            f"Custody offered to {agent.name}",
            {"handoff_id": handoff.id, "evidence_ids": evidence_ids},
        )
        handoff.status = HandoffStatus.ACCEPTED
        handoff.accepted_at = utc_now()
        package.custodian_id = agent.id
        package.version += 1
        package.updated_at = utc_now()
        self._event(
            workflow,
            "handoff.accepted",
            f"{agent.name} accepted custody with evidence",
            {"handoff_id": handoff.id, "to_agent_id": agent.id},
        )

    def _select_agent(self, capability: str) -> Optional[PhysicalAgent]:
        return next((agent for agent in self.agents.values() if agent.can_execute(capability)), None)

    def _fail_without_agent(self, workflow: Workflow, step: WorkflowStep) -> None:
        step.status = StepStatus.FAILED
        step.error = {
            "code": "NO_CAPABLE_AGENT",
            "message": f"No available agent exposes {step.capability}",
            "retryable": True,
        }
        workflow.status = WorkflowStatus.ATTENTION_REQUIRED
        workflow.updated_at = utc_now()
        self._event(workflow, "step.failed", f"No agent is available for {step.name}")

    def _event(
        self,
        workflow: Workflow,
        event_type: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        workflow.events.append(
            Event(len(workflow.events) + 1, event_type, workflow.id, message, data or {})
        )

    def _pause(self) -> None:
        if self.step_delay > 0:
            time.sleep(self.step_delay)

    def _workflow(self, workflow_id: str) -> Workflow:
        workflow = self.workflows.get(workflow_id)
        if not workflow:
            raise OrchestrationError(f"Unknown workflow: {workflow_id}")
        return workflow

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "agents": [agent.snapshot() for agent in self.agents.values()],
                "packages": [to_primitive(package) for package in self.packages.values()],
                "workflows": [to_primitive(workflow) for workflow in self.workflows.values()],
            }

    def workflow_snapshot(self, workflow_id: str) -> Dict[str, Any]:
        with self._lock:
            return to_primitive(self._workflow(workflow_id))


def create_demo_orchestrator(step_delay: float = 0.45) -> Orchestrator:
    orchestrator = Orchestrator(step_delay=step_delay)
    for agent in warehouse_agents():
        orchestrator.register_agent(agent)
    return orchestrator
