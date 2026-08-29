import unittest

from fastapi.testclient import TestClient

from orbis.api import create_app
from orbis.config import Settings
from orbis.coordinator import create_demo_coordinator
from orbis.outcomes import OutcomeCoordinator
from orbis.vision import FixtureVisionProvider


class OutcomeApiTests(unittest.TestCase):
    def setUp(self) -> None:
        warehouse = create_demo_coordinator(
            step_delay=0,
            vision_provider=FixtureVisionProvider(),
            background_execution=False,
        )
        outcomes = OutcomeCoordinator(
            warehouse, background_execution=False, step_delay_seconds=0
        )
        settings = Settings(
            vision_mode="fixture",
            vision_model="fixture-v1",
            vision_timeout_seconds=15,
            allowed_origins=["http://localhost:3000"],
            host="127.0.0.1",
            port=8080,
            key_configured=False,
        )
        self.client = TestClient(
            create_app(
                warehouse,
                settings,
                outcome_coordinator=outcomes,
                mount_console=False,
            )
        )

    def test_home_plan_to_completion_through_http_contract(self):
        plan_response = self.client.post(
            "/api/v1/outcome-plans",
            json={
                "request_id": "api-plan",
                "objective": "Prepare vegetarian pasta dinner for 12 by 7 PM",
                "constraints": {"guest_count": 12},
            },
        )
        self.assertEqual(201, plan_response.status_code)
        plan = plan_response.json()
        self.assertEqual("awaiting_approval", plan["status"])

        approved = self.client.post(
            f"/api/v1/outcome-plans/{plan['id']}/approve",
            json={
                "request_id": "api-approve",
                "approve_purchase": True,
                "approve_execution": True,
            },
        )
        self.assertEqual(201, approved.status_code)
        outcome = approved.json()

        started = self.client.post(
            f"/api/v1/outcomes/{outcome['id']}/start",
            json={"request_id": "api-start", "scenario_id": "normal"},
        )
        self.assertEqual(202, started.status_code)
        self.assertEqual("dinner_ready", started.json()["status"])

        completed = self.client.post(
            f"/api/v1/outcomes/{outcome['id']}/actions",
            json={"request_id": "api-cleanup", "action": "begin_cleanup"},
        )
        self.assertEqual(200, completed.status_code)
        self.assertEqual("completed", completed.json()["status"])

    def test_home_worker_roster_and_error_envelope(self):
        workers = self.client.get("/api/v1/home/workers")
        self.assertEqual(200, workers.status_code)
        self.assertEqual(5, len(workers.json()["workers"]))

        missing = self.client.get("/api/v1/outcomes/out_missing")
        self.assertEqual(404, missing.status_code)
        self.assertEqual("OUTCOME_NOT_FOUND", missing.json()["error"]["code"])

    def test_mutation_replay_header(self):
        body = {
            "request_id": "api-replay",
            "objective": "Prepare vegetarian pasta dinner for 12",
        }
        first = self.client.post("/api/v1/outcome-plans", json=body)
        second = self.client.post("/api/v1/outcome-plans", json=body)
        self.assertEqual("false", first.headers["Idempotent-Replay"])
        self.assertEqual("true", second.headers["Idempotent-Replay"])
        self.assertEqual(first.json()["id"], second.json()["id"])


if __name__ == "__main__":
    unittest.main()
