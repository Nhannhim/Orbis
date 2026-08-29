import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

from src.orbis.api import create_app
from src.orbis.config import Settings
from src.orbis.coordinator import Coordinator
from src.orbis.engine import create_demo_orchestrator
from src.orbis.vision import FixtureVisionProvider


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        fixture = FixtureVisionProvider()
        self.coordinator = Coordinator(
            orchestrator=create_demo_orchestrator(step_delay=0),
            vision_provider=fixture,
            vision_providers={"fixture": fixture},
            background_execution=False,
        )
        settings = Settings(
            host="127.0.0.1",
            port=8080,
            allowed_origins=["http://localhost:3000"],
            vision_mode="fixture",
            vision_model="gpt-5.4-mini",
            vision_timeout_seconds=15,
            key_configured=False,
        )
        self.client = TestClient(
            create_app(self.coordinator, settings, mount_console=False),
            raise_server_exceptions=False,
        )

    def create_workflow(self, scenario_id: str, request_id: str = None):
        suffix = uuid4().hex[:8]
        return self.client.post(
            "/api/v1/workflows",
            json={
                "request_id": request_id or f"req-create-{suffix}",
                "order_id": f"ORD-{suffix}",
                "package_id": f"PKG-{suffix}",
                "destination": "Oakland Distribution Center",
                "scenario_id": scenario_id,
            },
        )

    def start(self, workflow_id: str, request_id: str = None):
        return self.client.post(
            f"/api/v1/workflows/{workflow_id}/start",
            json={
                "request_id": request_id or f"req-start-{uuid4().hex[:8]}",
                "vision_mode": "fixture",
            },
        )

    def test_system_scenarios_and_exact_origin_cors(self) -> None:
        system = self.client.get("/api/v1/system")
        scenarios = self.client.get("/api/v1/vision/scenarios")
        allowed = self.client.options(
            "/api/v1/system",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        blocked = self.client.options(
            "/api/v1/system",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(200, system.status_code)
        self.assertEqual("fixture", system.json()["vision_mode"])
        self.assertTrue(
            {"normal", "damaged", "uncertain"}.issubset(
                {item["id"] for item in scenarios.json()["scenarios"]}
            )
        )
        self.assertTrue(
            all(item.get("image_url") for item in scenarios.json()["scenarios"])
        )
        self.assertEqual(
            "http://localhost:3000",
            allowed.headers.get("access-control-allow-origin"),
        )
        self.assertNotIn("access-control-allow-origin", blocked.headers)

    def test_normal_package_recommends_robot_and_completes(self) -> None:
        created = self.create_workflow("normal")
        self.assertEqual(201, created.status_code)
        created_view = created.json()
        workflow_id = created_view["id"]
        self.assertEqual(
            "warehouse-control",
            self.coordinator.orchestrator.packages[
                created_view["package_id"]
            ].custodian_id,
        )

        started = self.start(workflow_id)
        view = self.client.get(f"/api/v1/workflows/{workflow_id}").json()

        self.assertEqual(202, started.status_code)
        self.assertEqual("completed", view["status"])
        self.assertEqual(
            "delivery-robot-01", view["routing"]["recommended_worker_id"]
        )
        custody_events = [
            event for event in view["events"] if event["type"] == "custody.assigned"
        ]
        self.assertTrue(custody_events)
        self.assertNotIn(
            custody_events[0]["data"]["to_agent_id"],
            {"package-vision-01", "human-inspector-demo"},
        )

    def test_damaged_package_pauses_then_human_review_recommends_van(self) -> None:
        created = self.create_workflow("damaged")
        workflow_id = created.json()["id"]
        started = self.start(workflow_id)
        blocked = started.json()

        self.assertEqual("review_required", blocked["vision_gate"]["state"])
        self.assertEqual("vision_review", blocked["phase"])
        self.assertEqual("pending", blocked["physical_status"])
        original = blocked["inspection"]["result"]

        reviewed = self.client.post(
            f"/api/v1/vision/inspections/{blocked['inspection_id']}/reviews",
            json={
                "request_id": f"req-review-{uuid4().hex[:8]}",
                "actor_id": "human-inspector-demo",
                "disposition": "repackaged_and_cleared",
                "notes": "Repacked in a new carton and verified the label.",
            },
        )
        self.assertEqual(200, reviewed.status_code)
        view = self.client.get(f"/api/v1/workflows/{workflow_id}").json()
        self.assertEqual("completed", view["status"])
        self.assertEqual(
            "delivery-van-07", view["routing"]["recommended_worker_id"]
        )
        self.assertEqual(original, view["inspection"]["result"])
        self.assertEqual(1, len(view["inspection"]["reviews"]))

    def test_uncertain_package_clears_after_all_critical_fields_are_corrected(self) -> None:
        created = self.create_workflow("uncertain")
        workflow_id = created.json()["id"]
        blocked = self.start(workflow_id).json()

        reviewed = self.client.post(
            f"/api/v1/vision/inspections/{blocked['inspection_id']}/reviews",
            json={
                "request_id": f"req-review-{uuid4().hex[:8]}",
                "actor_id": "human-inspector-demo",
                "disposition": "corrected",
                "corrections": {
                    "package_type": "cardboard_box",
                    "size_class": "medium",
                    "visible_damage": "none",
                    "label_readable": True,
                },
                "notes": "Inspector verified all uncertain observations.",
            },
        )
        view = self.client.get(f"/api/v1/workflows/{workflow_id}").json()

        self.assertEqual(200, reviewed.status_code)
        self.assertEqual("completed", view["status"])
        self.assertEqual(
            "delivery-robot-01", view["routing"]["recommended_worker_id"]
        )
        self.assertEqual("uncertain", view["scenario_id"])

    def test_idempotent_replay_and_conflict(self) -> None:
        request_id = f"req-idem-{uuid4().hex[:8]}"
        first = self.create_workflow("normal", request_id)
        suffix = uuid4().hex[:8]
        replay = self.client.post(
            "/api/v1/workflows",
            json={
                "request_id": request_id,
                "order_id": first.json()["order_id"],
                "package_id": first.json()["package_id"],
                "destination": first.json()["destination"],
                "scenario_id": "normal",
            },
        )
        conflict = self.client.post(
            "/api/v1/workflows",
            json={
                "request_id": request_id,
                "order_id": f"ORD-{suffix}",
                "package_id": f"PKG-{suffix}",
                "destination": "Different destination",
                "scenario_id": "damaged",
            },
        )

        self.assertEqual("false", first.headers["Idempotent-Replay"])
        self.assertEqual("true", replay.headers["Idempotent-Replay"])
        self.assertEqual(first.json()["id"], replay.json()["id"])
        self.assertEqual(409, conflict.status_code)
        self.assertEqual("IDEMPOTENCY_CONFLICT", conflict.json()["error"]["code"])

    def test_validation_and_event_cursor_use_public_error_contract(self) -> None:
        invalid = self.client.post(
            "/api/v1/workflows",
            json={"request_id": "req-invalid"},
        )
        created = self.create_workflow("normal")
        workflow_id = created.json()["id"]
        self.start(workflow_id)
        first_page = self.client.get(
            f"/api/v1/workflows/{workflow_id}/events?after_sequence=0"
        ).json()
        last = first_page["last_sequence"]
        second_page = self.client.get(
            f"/api/v1/workflows/{workflow_id}/events?after_sequence={last}"
        ).json()

        self.assertEqual(422, invalid.status_code)
        self.assertEqual("INVALID_REQUEST", invalid.json()["error"]["code"])
        self.assertEqual("req-invalid", invalid.json()["request_id"])
        self.assertTrue(first_page["events"])
        self.assertEqual([], second_page["events"])


if __name__ == "__main__":
    unittest.main()
