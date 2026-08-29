import unittest
from concurrent.futures import ThreadPoolExecutor

from src.orbis.task_graph import TaskGraph, TaskGraphError, TaskNode


class TaskGraphTests(unittest.TestCase):
    def dinner_graph(self):
        return TaskGraph(
            [
                TaskNode("inspect-home", "Inspect home", "home", "inspect_home", weight=1),
                TaskNode(
                    "clean-floor",
                    "Clean floor",
                    "home",
                    "clean_floor",
                    dependencies=["inspect-home"],
                    weight=2,
                ),
                TaskNode(
                    "set-lights",
                    "Set lights",
                    "home",
                    "set_preparation_lighting",
                    dependencies=["inspect-home"],
                    weight=1,
                ),
                TaskNode("pick-groceries", "Pick groceries", "warehouse", "pick", weight=4),
                TaskNode(
                    "cook",
                    "Cook dinner",
                    "home",
                    "cook_meal",
                    dependencies=["pick-groceries", "clean-floor"],
                    weight=6,
                ),
            ]
        )

    def finish(self, graph, task_id, worker_id="worker-01"):
        graph.reserve(task_id, worker_id)
        graph.start(task_id)
        graph.begin_verification(task_id)
        return graph.complete(task_id, [{"id": f"ev-{task_id}", "passed": True}])

    def test_parallel_roots_and_parallel_dependents_become_ready(self):
        graph = self.dinner_graph()

        self.assertEqual(
            {"inspect-home", "pick-groceries"},
            set(graph.snapshot()["ready_task_ids"]),
        )

        self.finish(graph, "inspect-home")

        self.assertEqual(
            {"clean-floor", "set-lights", "pick-groceries"},
            set(graph.snapshot()["ready_task_ids"]),
        )

    def test_blocker_only_pauses_the_affected_branch(self):
        graph = self.dinner_graph()
        graph.require_attention(
            "inspect-home", "Person is in the furniture zone.", ["clear_obstruction"]
        )

        snapshot = graph.snapshot()

        self.assertEqual("attention_required", graph.task("inspect-home")["status"])
        self.assertEqual(["pick-groceries"], snapshot["ready_task_ids"])
        self.assertEqual(1, len(snapshot["active_blockers"]))

    def test_recovery_returns_task_to_ready_and_retains_history(self):
        graph = self.dinner_graph()
        blocked = graph.block(
            "inspect-home", "Path obstructed.", ["clear_obstruction"], source="home_vision"
        )
        blocker_id = blocked["blockers"][0]["id"]

        recovered = graph.recover(
            "inspect-home",
            "Host cleared the path.",
            blocker_id,
            [{"id": "ev-clear", "source": "human_attestation"}],
        )

        self.assertEqual("ready", recovered["status"])
        self.assertFalse(recovered["blockers"][0]["active"])
        self.assertEqual("Host cleared the path.", recovered["blockers"][0]["resolution"])
        self.assertEqual("ev-clear", recovered["evidence"][0]["id"])

    def test_failed_dependency_blocks_only_descendants(self):
        graph = self.dinner_graph()
        graph.reserve("pick-groceries", "picker-01")
        graph.start("pick-groceries")
        graph.fail("pick-groceries", "Inventory adapter unavailable.")

        self.finish(graph, "inspect-home")

        self.assertEqual("blocked", graph.task("cook")["status"])
        self.assertEqual("ready", graph.task("clean-floor")["status"])
        self.assertEqual("ready", graph.task("set-lights")["status"])

    def test_recovered_dependency_releases_its_downstream_blocker(self):
        graph = TaskGraph(
            [
                TaskNode("delivery", "Delivery", "delivery", "deliver"),
                TaskNode(
                    "cook", "Cook", "home", "cook_meal", dependencies=["delivery"]
                ),
            ]
        )
        graph.reserve("delivery", "van")
        graph.start("delivery")
        graph.fail("delivery", "Vehicle unavailable.")
        self.assertEqual("blocked", graph.task("cook")["status"])

        graph.recover("delivery", "Replacement vehicle assigned.")
        self.finish(graph, "delivery", "replacement-van")

        cook = graph.task("cook")
        self.assertEqual("ready", cook["status"])
        self.assertFalse(cook["blockers"][0]["active"])

    def test_weighted_progress_uses_task_weights_and_transition_progress(self):
        graph = TaskGraph(
            [
                TaskNode("small", "Small", "home", "small", weight=1),
                TaskNode("large", "Large", "home", "large", weight=3),
            ]
        )

        self.finish(graph, "small")
        self.assertEqual(25, graph.snapshot()["progress"])

        graph.reserve("large", "worker")
        graph.start("large")
        self.assertEqual(62, graph.snapshot()["progress"])

        graph.begin_verification("large")
        graph.complete("large")
        self.assertEqual(100, graph.snapshot()["progress"])
        self.assertTrue(graph.snapshot()["completed"])

    def test_snapshots_are_detached_from_internal_state(self):
        graph = self.dinner_graph()
        snapshot = graph.snapshot()
        snapshot["tasks"][0]["metadata"]["tampered"] = True

        self.assertNotIn("tampered", graph.task("inspect-home")["metadata"])

    def test_unknown_dependency_and_cycle_are_rejected(self):
        with self.assertRaises(TaskGraphError) as unknown:
            TaskGraph([TaskNode("a", "A", "home", "a", dependencies=["missing"])])
        self.assertEqual("UNKNOWN_DEPENDENCY", unknown.exception.code)

        with self.assertRaises(TaskGraphError) as cycle:
            TaskGraph(
                [
                    TaskNode("a", "A", "home", "a", dependencies=["b"]),
                    TaskNode("b", "B", "home", "b", dependencies=["a"]),
                ]
            )
        self.assertEqual("TASK_CYCLE", cycle.exception.code)

    def test_concurrent_reservation_has_only_one_winner(self):
        graph = TaskGraph([TaskNode("only", "Only", "home", "work")])

        def reserve(worker_id):
            try:
                graph.reserve("only", worker_id)
                return True
            except TaskGraphError:
                return False

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(reserve, [f"worker-{index}" for index in range(8)]))

        self.assertEqual(1, results.count(True))
        self.assertEqual("reserved", graph.task("only")["status"])


if __name__ == "__main__":
    unittest.main()
