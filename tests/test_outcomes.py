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
        self.assertTrue(any(event["type"] == "vision.review_resolved" for event in ready["events"]))

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
