import time
import unittest

from src.orbis.engine import Orchestrator, create_demo_orchestrator
from src.orbis.models import StepStatus, WorkflowStatus


class OrchestratorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = create_demo_orchestrator(step_delay=0)

    def create_workflow(self):
        return self.runtime.create_warehouse_workflow(
            order_id="ORD-TEST",
            package_id="PKG-TEST",
            destination="Test Distribution Center",
            trailer_id="truck-test",
        )

    def test_happy_path_completes_with_verified_custody_chain(self) -> None:
        workflow = self.create_workflow()

        result = self.runtime.run(workflow.id)
        package = self.runtime.packages[workflow.package_id]

        self.assertEqual(WorkflowStatus.COMPLETED, result.status)
        self.assertTrue(all(step.status == StepStatus.COMPLETED for step in result.steps))
        self.assertTrue(all(step.evidence for step in result.steps))
        self.assertTrue(all(evidence.passed for step in result.steps for evidence in step.evidence))
        self.assertEqual(2, len(result.handoffs))
        self.assertEqual("packing-arm-01", result.handoffs[0].from_agent_id)
        self.assertEqual("amr-01", result.handoffs[0].to_agent_id)
        self.assertEqual("amr-01", result.handoffs[1].from_agent_id)
        self.assertEqual("loading-station-01", result.handoffs[1].to_agent_id)
        self.assertEqual("loaded", package.status)
        self.assertEqual("truck-test:cargo_bay", package.location)
        self.assertEqual("loading-station-01", package.custodian_id)

    def test_failed_verification_stops_then_retry_recovers(self) -> None:
        workflow = self.create_workflow()
        self.runtime.inject_failure("loading-station-01", "load_vehicle")

        first_result = self.runtime.run(workflow.id)

        self.assertEqual(WorkflowStatus.ATTENTION_REQUIRED, first_result.status)
        self.assertEqual(StepStatus.FAILED, first_result.steps[2].status)
        self.assertEqual("VERIFICATION_FAILED", first_result.steps[2].error["code"])
        self.assertEqual("staged", self.runtime.packages[workflow.package_id].status)

        self.runtime.retry(workflow.id)
        deadline = time.time() + 2
        while time.time() < deadline:
            if workflow.status == WorkflowStatus.COMPLETED:
                break
            time.sleep(0.01)

        self.assertEqual(WorkflowStatus.COMPLETED, workflow.status)
        self.assertEqual(2, workflow.steps[2].attempt)
        self.assertEqual(2, len(workflow.steps[2].evidence))
        self.assertEqual("loaded", self.runtime.packages[workflow.package_id].status)
        self.assertIn("workflow.retry_requested", [event.type for event in workflow.events])

    def test_missing_capability_requires_attention_without_executing(self) -> None:
        runtime = Orchestrator(step_delay=0)
        workflow = runtime.create_warehouse_workflow("ORD-X", "PKG-X", "Nowhere")

        result = runtime.run(workflow.id)

        self.assertEqual(WorkflowStatus.ATTENTION_REQUIRED, result.status)
        self.assertEqual("NO_CAPABLE_AGENT", result.steps[0].error["code"])
        self.assertEqual(0, result.steps[0].attempt)

    def test_event_sequence_is_monotonic_and_auditable(self) -> None:
        workflow = self.create_workflow()
        self.runtime.run(workflow.id)

        sequences = [event.sequence for event in workflow.events]
        event_types = [event.type for event in workflow.events]
        self.assertEqual(list(range(1, len(sequences) + 1)), sequences)
        self.assertEqual(2, event_types.count("handoff.offered"))
        self.assertEqual(2, event_types.count("handoff.accepted"))
        self.assertEqual(3, event_types.count("step.completed"))


if __name__ == "__main__":
    unittest.main()

