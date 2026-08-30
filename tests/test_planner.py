import unittest

from src.orbis.planner import AgentProfile, OrchestratorIntelligence, default_agent_registry


class OrchestratorIntelligenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.intelligence = OrchestratorIntelligence()

    def test_dinner_request_compiles_two_workflows_with_real_dependencies(self) -> None:
        plan = self.intelligence.analyze(
            "Buy groceries for dinner for 12 under $250, deliver them, clean the house, arrange the table and chairs, and set warm lighting."
        )

        tasks = {task.id: task for task in plan.tasks}
        first_wave = next(wave for wave in plan.waves if wave.id == "parallel")

        self.assertEqual("dinner_delivery", plan.scenario_id)
        self.assertFalse(plan.blocked)
        self.assertFalse(plan.requires_approval)
        self.assertIn("wh-fulfill", first_wave.task_ids)
        self.assertIn("home-clear", first_wave.task_ids)
        self.assertEqual(["home-clear"], tasks["home-table"].dependencies)
        self.assertEqual(["wh-deliver"], tasks["home-accept"].dependencies)
        self.assertIn("home-accept", tasks["home-stage"].dependencies)

    def test_simultaneous_reset_assigns_five_robots_in_one_safe_wave(self) -> None:
        plan = self.intelligence.analyze(
            "Reset the entry, kitchen, dining table, living-room chairs, and lighting simultaneously."
        )

        self.assertEqual("simultaneous_reset", plan.scenario_id)
        self.assertEqual(1, len(plan.waves))
        self.assertEqual(5, len(plan.waves[0].task_ids))
        self.assertEqual(5, len({task.assigned_agent_id for task in plan.tasks}))
        self.assertEqual(5, len({task.resource for task in plan.tasks}))
        self.assertTrue(all(not task.dependencies for task in plan.tasks))
        self.assertFalse(plan.blocked)

    def test_purchase_without_budget_is_approval_gated(self) -> None:
        plan = self.intelligence.analyze(
            "Order groceries, deliver them to the house, and put everything in the pantry."
        )

        purchase = next(item for item in plan.guardrails if item.id == "purchase")
        self.assertEqual("gated", purchase.status)
        self.assertTrue(plan.requires_approval)
        self.assertFalse(plan.blocked)

    def test_missing_robot_capability_blocks_delegation(self) -> None:
        agents = list(default_agent_registry().values())
        agents = [agent for agent in agents if agent.id != "table-h3"]
        agents.append(AgentProfile("table-h3", "Unqualified table", "home", (), ("offline",)))
        intelligence = OrchestratorIntelligence(agents)

        plan = intelligence.analyze("Prepare the home for 8 guests and arrange the dining table.")

        capability = next(item for item in plan.guardrails if item.id == "capability")
        self.assertEqual("blocked", capability.status)
        self.assertIn("home-table", capability.task_ids)
        self.assertTrue(plan.blocked)


if __name__ == "__main__":
    unittest.main()
