import unittest

from orbis.planning import FixtureDinnerPlanner, PlanningError, validate_plan


class FixtureDinnerPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.planner = FixtureDinnerPlanner()

    def test_pasta_request_produces_approvable_order_and_worker_plan(self) -> None:
        plan = self.planner.plan(
            "Prepare a vegetarian pasta dinner for 12 by 7:00 PM and clean up afterward"
        )

        self.assertEqual("Pasta dinner for 12", plan["title"])
        self.assertEqual(12, plan["guest_count"])
        self.assertEqual("7:00 PM", plan["ready_time"])
        self.assertTrue(plan["order"]["requires_refrigeration"])
        self.assertGreater(plan["order"]["estimated_volume_l"], 45)
        self.assertIn("roomba-01", plan["workers"])
        self.assertIn("home-humanoid-cook-01", plan["workers"])
        self.assertTrue(plan["policies"]["purchase_requires_approval"])
        self.assertEqual("host_triggered", plan["policies"]["cleanup"])

    def test_guest_count_scales_order(self) -> None:
        small = self.planner.plan("Pasta dinner for 2 at 7 PM")
        large = self.planner.plan("Pasta dinner for 24 at 7 PM")

        self.assertEqual(2, small["guest_count"])
        self.assertEqual(24, large["guest_count"])
        self.assertGreater(
            large["order"]["estimated_weight_kg"],
            small["order"]["estimated_weight_kg"],
        )

    def test_empty_objective_and_unsafe_guest_count_are_rejected(self) -> None:
        with self.assertRaises(PlanningError):
            self.planner.plan("")
        with self.assertRaises(PlanningError):
            self.planner.plan("Dinner for 80")

    def test_validation_keeps_purchase_and_cleanup_gates_deterministic(self) -> None:
        plan = self.planner.plan("Dinner for 12")
        plan["policies"]["purchase_requires_approval"] = False
        with self.assertRaises(PlanningError):
            validate_plan(plan)


if __name__ == "__main__":
    unittest.main()
