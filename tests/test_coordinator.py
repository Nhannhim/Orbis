import unittest
from concurrent.futures import ThreadPoolExecutor

from src.orbis.coordinator import Coordinator, CoordinatorError
from src.orbis.engine import create_demo_orchestrator
from src.orbis.vision import FixtureVisionProvider


class _FlakyVisionProvider:
    provider_name = "flaky-fixture"

    def __init__(self) -> None:
        self.calls = 0
        self.fixture = FixtureVisionProvider()

    def inspect(self, scenario_id, workflow_id, object_id):
        self.calls += 1
        if self.calls == 1:
            return {
                "status": "service_unavailable",
                "scenario_id": scenario_id,
                "workflow_id": workflow_id,
                "object_id": object_id,
                "provider": self.provider_name,
                "analysis": None,
                "error": {
                    "code": "VISION_TIMEOUT",
                    "message": "Vision timed out.",
                    "retryable": True,
                },
            }
        return self.fixture.inspect(scenario_id, workflow_id, object_id)


class CoordinatorTests(unittest.TestCase):
    def coordinator(self, provider=None):
        return Coordinator(
            create_demo_orchestrator(step_delay=0),
            vision_provider=provider or FixtureVisionProvider(),
            background_execution=False,
        )

    def create(self, coordinator, scenario="normal", request_id=None, suffix=""):
        return coordinator.create_workflow(
            {
                "order_id": f"ORD-{scenario}{suffix}",
                "package_id": f"PKG-{scenario}{suffix}",
                "destination": "Test destination",
                "scenario_id": scenario,
            },
            request_id=request_id,
        )

    def test_normal_inspection_releases_pending_physical_workflow_to_robot(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "normal")

        self.assertEqual("pending", created["physical_status"])
        self.assertEqual("vision_pending", created["phase"])
        self.assertEqual("warehouse-control", coordinator.orchestrator.packages[created["package_id"]].custodian_id)

        completed = coordinator.start_workflow(created["id"], "start-normal")

        self.assertEqual("completed", completed["status"])
        self.assertEqual("completed", completed["physical_status"])
        self.assertEqual("robot", completed["routing"]["mode"])
        self.assertEqual("delivery-robot-01", completed["routing"]["worker_id"])
        self.assertTrue(completed["vision_gate"]["cleared"])
        self.assertEqual(100, completed["progress"])

    def test_damaged_package_waits_for_repackaging_then_routes_to_van_07(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "damaged")

        blocked = coordinator.start_workflow(created["id"], "start-damaged")
        package = coordinator.orchestrator.packages[created["package_id"]]
        original = coordinator.get_inspection(blocked["inspection_id"])["result"]

        self.assertEqual("attention_required", blocked["status"])
        self.assertEqual("vision_review", blocked["phase"])
        self.assertEqual("pending", blocked["physical_status"])
        self.assertEqual("warehouse-control", package.custodian_id)
        self.assertEqual("blocked", blocked["routing"]["status"])

        reviewed = coordinator.review_inspection(
            blocked["inspection_id"],
            {
                "resolution": "repackaged_and_cleared",
                "notes": "Repacked in a new box and verified the label.",
            },
            "review-damaged",
        )
        completed = coordinator.get_workflow(created["id"])

        self.assertEqual(original, reviewed["result"])
        self.assertEqual("completed", completed["status"])
        self.assertEqual("van", completed["routing"]["mode"])
        self.assertEqual("delivery-van-07", completed["routing"]["worker_id"])

    def test_uncertain_evidence_blocks_both_candidates_and_never_takes_custody(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "uncertain")

        blocked = coordinator.start_workflow(created["id"], "start-uncertain")

        self.assertEqual("attention_required", blocked["status"])
        self.assertEqual("pending", blocked["physical_status"])
        self.assertIsNone(blocked["routing"]["worker_id"])
        self.assertTrue(all(not item["eligible"] for item in blocked["routing"]["candidates"]))
        self.assertEqual(
            "warehouse-control",
            coordinator.orchestrator.packages[created["package_id"]].custodian_id,
        )
        self.assertEqual(["submit_review"], blocked["permitted_recovery_actions"])
        with self.assertRaises(CoordinatorError) as raised:
            coordinator.retry_workflow(created["id"], "retry-uncertain")
        self.assertEqual("WORKFLOW_NOT_RETRYABLE", raised.exception.code)

    def test_provider_failure_is_retryable_and_retry_does_not_duplicate_execution(self):
        provider = _FlakyVisionProvider()
        coordinator = self.coordinator(provider)
        created = self.create(coordinator, "normal")

        failed = coordinator.start_workflow(created["id"], "start-flaky")

        self.assertEqual("attention_required", failed["status"])
        self.assertEqual("pending", failed["physical_status"])
        self.assertTrue(failed["error"]["retryable"])
        self.assertEqual(["retry_inspection"], failed["permitted_recovery_actions"])

        recovered = coordinator.retry_workflow(created["id"], "retry-flaky")
        replayed = coordinator.retry_workflow(created["id"], "retry-flaky")

        self.assertEqual("completed", recovered["status"])
        self.assertEqual(recovered["id"], replayed["id"])
        self.assertEqual(2, provider.calls)
        self.assertTrue(
            coordinator.idempotency_metadata("retry-flaky", "retry_workflow")["replayed"]
        )
        event_types = [item["type"] for item in replayed["events"]]
        self.assertEqual(1, event_types.count("physical.dispatch_requested"))

    def test_rejected_review_cancels_without_physical_dispatch(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "damaged")
        blocked = coordinator.start_workflow(created["id"], "start-rejected")

        coordinator.review_inspection(
            blocked["inspection_id"],
            {"resolution": "rejected", "notes": "Package cannot be recovered."},
            "review-rejected",
        )
        cancelled = coordinator.get_workflow(created["id"])

        self.assertEqual("cancelled", cancelled["status"])
        self.assertEqual("pending", cancelled["physical_status"])
        self.assertEqual("blocked", cancelled["route"]["status"])
        self.assertEqual([], cancelled["permitted_recovery_actions"])
        self.assertNotIn("physical.dispatch_requested", [e["type"] for e in cancelled["events"]])

    def test_review_clearance_requires_notes(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "damaged")
        blocked = coordinator.start_workflow(created["id"], "start-notes")

        with self.assertRaises(CoordinatorError) as raised:
            coordinator.review_inspection(
                blocked["inspection_id"],
                {"resolution": "cleared_by_inspector"},
                "review-without-notes",
            )

        self.assertEqual("REVIEW_NOTES_REQUIRED", raised.exception.code)

    def test_review_replay_is_idempotent_and_conflicting_disposition_is_rejected(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "damaged")
        blocked = coordinator.start_workflow(created["id"], "start-review-idem")
        payload = {
            "resolution": "repackaged_and_cleared",
            "notes": "Repacked and sealed.",
        }

        first = coordinator.review_inspection(
            blocked["inspection_id"], payload, "review-idem"
        )
        replay = coordinator.review_inspection(
            blocked["inspection_id"], payload, "review-idem"
        )

        self.assertEqual(first["reviews"], replay["reviews"])
        self.assertEqual(1, len(replay["reviews"]))
        with self.assertRaises(CoordinatorError) as raised:
            coordinator.review_inspection(
                blocked["inspection_id"],
                {"resolution": "rejected", "notes": "Conflicting review."},
                "review-conflict",
            )
        self.assertEqual("REVIEW_CONFLICT", raised.exception.code)

    def test_idempotency_replays_same_resource_and_rejects_conflicts(self):
        coordinator = self.coordinator()
        payload = {
            "order_id": "ORD-IDEM",
            "package_id": "PKG-IDEM",
            "destination": "Test destination",
            "scenario_id": "normal",
        }
        first = coordinator.create_workflow(payload, "create-idem")
        second = coordinator.create_workflow(payload, "create-idem")

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(1, len(coordinator.orchestrator.workflows))
        self.assertTrue(
            coordinator.idempotency_metadata("create-idem", "create_workflow")["replayed"]
        )
        with self.assertRaises(CoordinatorError) as raised:
            coordinator.create_workflow({**payload, "destination": "Elsewhere"}, "create-idem")
        self.assertEqual("IDEMPOTENCY_CONFLICT", raised.exception.code)

    def test_concurrent_idempotent_creates_produce_one_workflow(self):
        coordinator = self.coordinator()
        payload = {
            "order_id": "ORD-CONCURRENT",
            "package_id": "PKG-CONCURRENT",
            "destination": "Test destination",
            "scenario_id": "normal",
        }

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(
                pool.map(
                    lambda _: coordinator.create_workflow(
                        payload, "create-concurrent"
                    ),
                    range(8),
                )
            )

        self.assertEqual(1, len({item["id"] for item in results}))
        self.assertEqual(1, len(coordinator.orchestrator.workflows))

    def test_events_are_unified_monotonic_and_cursor_safe(self):
        coordinator = self.coordinator()
        first = self.create(coordinator, "normal", suffix="-1")
        coordinator.start_workflow(first["id"], "start-events-1")
        second = self.create(coordinator, "damaged", suffix="-2")
        coordinator.start_workflow(second["id"], "start-events-2")

        first_events = coordinator.events(first["id"])["events"]
        second_events = coordinator.events(second["id"])["events"]
        all_sequences = [item["sequence"] for item in first_events + second_events]
        self.assertEqual(len(all_sequences), len(set(all_sequences)))
        self.assertEqual(sorted(item["sequence"] for item in first_events), [item["sequence"] for item in first_events])
        cursor = first_events[5]["sequence"]
        remaining = coordinator.events(first["id"], cursor)["events"]
        self.assertTrue(all(item["sequence"] > cursor for item in remaining))
        self.assertTrue(any(item["source"] == "physical_orchestrator" for item in first_events))
        self.assertTrue(any(item["source"] == "vision" for item in first_events))

    def test_worker_views_use_public_kinds_and_expose_reliability_counts(self):
        coordinator = self.coordinator()
        created = self.create(coordinator, "damaged")
        coordinator.start_workflow(created["id"], "start-workers")
        coordinator.review_inspection(
            coordinator.get_workflow(created["id"])["inspection_id"],
            {
                "resolution": "repackaged_and_cleared",
                "notes": "Repacked and inspected.",
            },
            "review-workers",
        )

        workers = coordinator.list_workers()
        self.assertTrue({worker["kind"] for worker in workers} <= {"ai", "robot", "human"})
        by_id = {worker["id"]: worker for worker in workers}
        self.assertFalse(by_id["package-vision-01"]["custody_capable"])
        self.assertFalse(by_id["human-inspector-demo"]["custody_capable"])
        self.assertEqual("human", by_id["delivery-van-07"]["kind"])
        for worker in workers:
            self.assertEqual(
                {
                    "attempts",
                    "completions",
                    "failures",
                    "interventions",
                    "success_rate",
                    "intervention_rate",
                },
                {
                    "attempts",
                    "completions",
                    "failures",
                    "interventions",
                    "success_rate",
                    "intervention_rate",
                }
                & set(worker["reliability"]),
            )


if __name__ == "__main__":
    unittest.main()
