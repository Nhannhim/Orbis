import unittest
from concurrent.futures import ThreadPoolExecutor

from src.orbis.home import (
    HomeEvidence,
    HomeWorkerError,
    HomeWorkerRegistry,
    home_workers,
)


class HomeWorkerTests(unittest.TestCase):
    def test_locked_roster_contains_five_named_workers_and_expected_media(self):
        workers = {worker.name: worker.snapshot() for worker in home_workers()}

        self.assertEqual(
            {
                "Roomba",
                "Humanoid Cook",
                "Loader Robot",
                "Furniture Robot",
                "Lamp Agent",
            },
            set(workers),
        )
        self.assertEqual(
            "/videos/home-cleanliness.mp4", workers["Roomba"]["media"]["video_url"]
        )
        self.assertEqual("SIMULATED FEED", workers["Lamp Agent"]["media"]["label"])
        self.assertTrue(
            all(worker["kind"] == "robot" and worker["health"] == "online" for worker in workers.values())
        )

    def test_capability_registry_routes_each_home_job(self):
        registry = HomeWorkerRegistry()

        expected = {
            "clean_floor": "home-roomba-01",
            "cook_meal": "home-humanoid-cook-01",
            "receive_delivery": "home-loader-01",
            "position_chairs": "home-furniture-01",
            "set_dinner_lighting": "home-lamp-agent-01",
        }
        for index, (capability, worker_id) in enumerate(expected.items()):
            assignment = registry.reserve(f"task-{index}", capability)
            self.assertEqual(worker_id, assignment["id"])

    def test_worker_lifecycle_records_evidence_and_reliability(self):
        worker = HomeWorkerRegistry().get("home-roomba-01")
        worker.reserve("clean-1", "clean_floor")
        worker.start("clean-1")
        worker.begin_verification("clean-1")

        evidence = worker.complete(
            "clean-1", {"coverage_percent": 100, "restricted_zones_entered": 0}
        )
        snapshot = worker.snapshot()

        self.assertTrue(evidence["passed"])
        self.assertIsNone(evidence["confidence"])
        self.assertEqual("available", snapshot["status"])
        self.assertEqual(1, snapshot["reliability"]["attempts"])
        self.assertEqual(1.0, snapshot["reliability"]["success_rate"])
        self.assertEqual(1, snapshot["evidence_count"])

    def test_non_model_evidence_cannot_claim_confidence(self):
        with self.assertRaises(HomeWorkerError) as raised:
            HomeEvidence(
                id="ev-bad",
                worker_id="home-roomba-01",
                task_id="clean-1",
                kind="cleaning_coverage",
                passed=True,
                observations={"coverage_percent": 100},
                source="robot_telemetry",
                confidence=0.99,
            )

        self.assertEqual("INVALID_EVIDENCE_CONFIDENCE", raised.exception.code)

    def test_human_intervention_is_append_only_attestation_without_confidence(self):
        worker = HomeWorkerRegistry().get("home-furniture-01")
        worker.reserve("layout-1", "configure_table")
        worker.start("layout-1")
        worker.fail("layout-1", "Movement zone occupied.")

        intervention = worker.record_human_intervention(
            "layout-1", "Cleared movement zone.", "human-host-demo"
        )
        evidence = worker.evidence()

        self.assertEqual("human_attestation", intervention["source"])
        self.assertIsNone(intervention["confidence"])
        self.assertEqual(2, len(evidence))
        self.assertFalse(evidence[0]["passed"])
        self.assertEqual(1, worker.snapshot()["reliability"]["human_interventions"])

    def test_worker_recovery_records_workaround_and_can_retry(self):
        worker = HomeWorkerRegistry().get("home-loader-01")
        worker.reserve("handoff-1", "receive_delivery")
        worker.start("handoff-1")
        worker.fail("handoff-1", "Manifest barcode obscured.")

        recovered = worker.recover(
            "handoff-1", "Human verified the printed manifest.", "host-01"
        )
        worker.start("handoff-1")
        completed = worker.complete("handoff-1", {"manifest_match": True})

        self.assertEqual("reserved", recovered["status"])
        self.assertTrue(completed["passed"])
        self.assertEqual(1, worker.snapshot()["reliability"]["human_interventions"])
        self.assertEqual(3, len(worker.evidence()))

    def test_unavailable_worker_is_not_returned_as_eligible(self):
        registry = HomeWorkerRegistry()
        roomba = registry.get("home-roomba-01")
        roomba.set_online(False)

        self.assertEqual([], registry.eligible("clean_floor"))
        with self.assertRaises(HomeWorkerError) as raised:
            registry.reserve("clean-1", "clean_floor")
        self.assertEqual("NO_ELIGIBLE_WORKER", raised.exception.code)

    def test_concurrent_registry_reservation_assigns_worker_once(self):
        registry = HomeWorkerRegistry()

        def reserve(index):
            try:
                registry.reserve(f"light-{index}", "set_dinner_lighting")
                return True
            except HomeWorkerError:
                return False

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(reserve, range(8)))

        self.assertEqual(1, results.count(True))
        self.assertEqual(
            "reserved", registry.get("home-lamp-agent-01").snapshot()["status"]
        )

    def test_capability_constraints_are_exposed(self):
        registry = HomeWorkerRegistry()
        cook = registry.get("home-humanoid-cook-01").snapshot()
        capabilities = {item["name"] for item in cook["capabilities"]}

        self.assertEqual(
            {"prepare_food", "cook_meal", "plate_meal", "store_leftovers"},
            capabilities,
        )


if __name__ == "__main__":
    unittest.main()
