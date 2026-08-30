import unittest

from orbis.coordinator import create_demo_coordinator
from orbis.outcomes import OutcomeCoordinator, OutcomeError
from orbis.vision import FixtureVisionProvider


class OutcomeCoordinatorTests(unittest.TestCase):
    def setUp(self) -> None:
        warehouse = create_demo_coordinator(
            step_delay=0,
            vision_provider=FixtureVisionProvider(),
            background_execution=False,
        )
        self.coordinator = OutcomeCoordinator(
            warehouse,
            background_execution=False,
            step_delay_seconds=0,
        )

    def create_approved(self):
        plan = self.coordinator.create_plan(
            {
                "objective": "Prepare a vegetarian pasta dinner for 12 by 7 PM and clean up afterward.",
                "constraints": {"guest_count": 12, "dietary": ["vegetarian"]},
            },
            "req-plan",
        )
        return self.coordinator.approve_plan(
            plan["id"],
            {
                "approve_purchase": True,
                "approve_execution": True,
                "actor_id": "host-demo",
            },
            "req-approve",
        )

    def test_plan_requires_approval_and_exposes_three_lanes(self):
        plan = self.coordinator.create_plan(
            {"objective": "Vegetarian pasta dinner for 12 by 7 PM"}, "plan-1"
        )
        self.assertEqual("awaiting_approval", plan["status"])
        self.assertEqual(12, plan["guest_count"])
        with self.assertRaises(OutcomeError) as raised:
            self.coordinator.approve_plan(
                plan["id"],
                {"approve_purchase": False, "approve_execution": True},
                "approve-1",
            )
        self.assertEqual("APPROVAL_REQUIRED", raised.exception.code)

        outcome = self.coordinator.approve_plan(
            plan["id"],
            {"approve_purchase": True, "approve_execution": True},
            "approve-2",
        )
        self.assertEqual(["warehouse", "delivery", "home"], [lane["id"] for lane in outcome["lanes"]])

    def test_normal_story_reaches_dinner_ready_then_cleanup_completion(self):
        outcome = self.create_approved()
        ready = self.coordinator.start_outcome(
            outcome["id"], {"scenario_id": "normal"}, "req-start"
        )
        self.assertEqual("dinner_ready", ready["status"])
        self.assertEqual("delivery-large-01", ready["routing"]["selected_worker_id"])
        small = next(item for item in ready["routing"]["candidates"] if item["worker_id"] == "delivery-small-01")
        self.assertFalse(small["eligible"])
        self.assertEqual(3, len(ready["custody"]["history"]))
        self.assertIn("begin_cleanup", ready["permitted_actions"])

        completed = self.coordinator.apply_action(
            outcome["id"],
            {"action": "begin_cleanup", "actor_id": "host-demo"},
            "req-cleanup",
        )
        self.assertEqual("completed", completed["status"])
        self.assertEqual(100, completed["progress_percent"])

    def test_damaged_package_blocks_delivery_and_preserves_parallel_home_work(self):
        outcome = self.create_approved()
        blocked = self.coordinator.start_outcome(
            outcome["id"], {"scenario_id": "damaged"}, "req-start-damaged"
        )
        self.assertEqual("attention_required", blocked["status"])
        statuses = {task["id"]: task["status"] for task in blocked["tasks"]}
        self.assertEqual("attention_required", statuses["wh_vision"])
        self.assertEqual("completed", statuses["home_floors"])
        self.assertEqual("queued", statuses["delivery_transit"])
        self.assertIn("submit_vision_review", blocked["permitted_actions"])

        ready = self.coordinator.apply_action(
            outcome["id"],
            {
                "action": "submit_vision_review",
                "actor_id": "human-inspector-demo",
                "parameters": {
                    "disposition": "repackaged_and_cleared",
                    "notes": "Damaged package was repackaged and resealed.",
                },
            },
            "req-review",
        )
        self.assertEqual("dinner_ready", ready["status"])
        self.assertTrue(any(event["type"] == "vision.review_resolved" for event in self.coordinator.events(outcome["id"])["events"]))

    def test_history_is_detached_and_has_media_provenance(self):
        outcome = self.create_approved()
        before = self.coordinator.snapshot(outcome["id"], 1)
        self.coordinator.start_outcome(outcome["id"], {}, "history-start")
        after = self.coordinator.snapshot(outcome["id"], 1)
        self.assertEqual(before, after)
        self.assertEqual("scheduled", after["status"])
        self.assertEqual([], after["permitted_actions"])
        after["tasks"][0]["status"] = "tampered"
        self.assertNotEqual("tampered", self.coordinator.snapshot(outcome["id"], 1)["tasks"][0]["status"])
        ready = self.coordinator.get_outcome(outcome["id"])
        self.assertEqual("synthetic_illustration", ready["milestone_images"]["dinner_ready"]["kind"])
        self.assertNotIn("home_restored", ready["milestone_images"])
        self.assertEqual("unavailable", ready["media"]["home_plate"]["kind"])
        self.assertEqual(ready["latest_sequence"], len(self.coordinator.history(outcome["id"])["checkpoints"]))
        self.assertEqual(1, len(self.coordinator.list_outcomes()["outcomes"]))

    def test_dependencies_worker_exclusion_and_physical_states_at_every_checkpoint(self):
        outcome = self.create_approved()
        self.coordinator.start_outcome(outcome["id"], {}, "graph-start")
        self.coordinator.apply_action(outcome["id"], {"action": "begin_cleanup"}, "graph-clean")
        physical_states = set()
        for checkpoint in self.coordinator.history(outcome["id"])["checkpoints"]:
            state = self.coordinator.snapshot(outcome["id"], checkpoint["sequence"])
            tasks = {t["id"]: t for t in state["tasks"]}
            active_workers = []
            for task in tasks.values():
                if task["status"] in {"reserved", "executing", "verifying"}:
                    active_workers.append(task["assigned_worker_id"])
                    self.assertTrue(all(tasks[d]["status"] == "completed" for d in task["dependencies"]))
                if task["id"] == "wh_stage":
                    physical_states.add(task["status"])
            self.assertEqual(len(active_workers), len(set(active_workers)))
        self.assertTrue({"reserved", "executing", "verifying", "completed"} <= physical_states)
        final = self.coordinator.get_outcome(outcome["id"])
        self.assertIn("home_restored", final["milestone_images"])
        tasks = {t["id"]: t for t in final["tasks"]}
        self.assertEqual(["home_cook"], tasks["home_plate"]["dependencies"])
        self.assertIn("home_plate", tasks["home_serve"]["dependencies"])
        self.assertIn("home_serve", tasks["home_verify"]["dependencies"])
        self.assertEqual(["cleanup_furniture"], tasks["cleanup_floors"]["dependencies"])

    def test_default_pacing_and_restart_retention(self):
        coordinator = OutcomeCoordinator(self.coordinator.warehouse)
        self.assertEqual(6, coordinator.task_duration("home_plate"))
        self.assertEqual(12, coordinator.task_duration("home_cook"))
        self.assertEqual(10, coordinator.task_duration("delivery_transit"))
        self.assertEqual(3, coordinator.task_duration("cleanup_verify"))
        with self.assertRaises(OutcomeError) as raised:
            coordinator.snapshot("expired-run", 1)
        self.assertIn("expired", str(raised.exception))

    def test_rejected_review_stops_the_outcome(self):
        outcome = self.create_approved()
        self.coordinator.start_outcome(outcome["id"], {"scenario_id": "damaged"}, "reject-start")
        rejected = self.coordinator.apply_action(outcome["id"], {"action": "submit_vision_review", "parameters": {"disposition": "rejected"}}, "reject")
        self.assertEqual("cancelled", rejected["status"])
        self.assertNotEqual("completed", next(t for t in rejected["tasks"] if t["id"] == "wh_pack")["status"])

    def test_idempotency_and_event_cursor(self):
        body = {"objective": "Vegetarian pasta dinner for 12"}
        first = self.coordinator.create_plan(body, "same-request")
        replay = self.coordinator.create_plan(body, "same-request")
        self.assertEqual(first["id"], replay["id"])
        self.assertTrue(
            self.coordinator.idempotency_metadata("same-request", "create_plan")["replayed"]
        )
        with self.assertRaises(OutcomeError) as raised:
            self.coordinator.create_plan(
                {"objective": "Different dinner for 4"}, "same-request"
            )
        self.assertEqual("IDEMPOTENCY_CONFLICT", raised.exception.code)

        outcome = self.coordinator.approve_plan(
            first["id"],
            {"approve_purchase": True, "approve_execution": True},
            "approve-events",
        )
        events = self.coordinator.events(outcome["id"], 0)
        later = self.coordinator.events(outcome["id"], events["last_sequence"])
        self.assertEqual([], later["events"])


if __name__ == "__main__":
    unittest.main()
