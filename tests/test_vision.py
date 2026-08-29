import json
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from src.orbis.vision import (
    CRITICAL_FIELD_CONFIDENCE,
    OVERALL_CONFIDENCE,
    PROMPT_VERSION,
    SCENARIO_REGISTRY,
    VISION_ANALYSIS_SCHEMA,
    FixtureVisionProvider,
    OpenAIVisionProvider,
    VisionProvider,
    evaluate_policy,
    inspect,
)


def normal_analysis():
    return {
        "observations": {
            "package_detected": True,
            "package_type": "cardboard_box",
            "size_class": "medium",
            "visible_damage": "none",
            "damage_indicators": [],
            "label_present": True,
            "label_readable": True,
        },
        "confidence": {
            "package_type": 0.95,
            "size_class": 0.95,
            "visible_damage": 0.95,
            "label_readable": 0.95,
            "overall": 0.95,
        },
    }


def completed_inspection(analysis=None):
    return {
        "status": "completed",
        "scenario_id": "custom",
        "workflow_id": "wf-test",
        "object_id": "pkg-test",
        "provider": "fixture",
        "analysis": analysis or normal_analysis(),
        "error": None,
    }


class FixtureVisionProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = FixtureVisionProvider()

    def test_implements_provider_interface(self) -> None:
        self.assertIsInstance(self.provider, VisionProvider)

    def test_normal_scenario_is_clear(self) -> None:
        result = inspect("normal", "wf-1", "pkg-1")
        policy = evaluate_policy(result)

        self.assertEqual("completed", result["status"])
        self.assertEqual("wf-1", result["workflow_id"])
        self.assertEqual("pkg-1", result["object_id"])
        self.assertEqual("/images/vision/package-normal.jpg", result["image_url"])
        self.assertEqual("fixture", result["provenance"]["mode"])
        self.assertEqual("fixture-v1", result["provenance"]["model"])
        self.assertEqual("clear", policy["decision"])
        self.assertEqual([], policy["signals"])

    def test_damaged_scenario_requires_review(self) -> None:
        result = self.provider.inspect("damaged", "wf-2", "pkg-2")
        policy = evaluate_policy(result)

        self.assertEqual("severe", result["analysis"]["observations"]["visible_damage"])
        self.assertEqual("review_required", policy["decision"])
        self.assertIn("VISIBLE_DAMAGE_REQUIRES_REVIEW", policy["signals"])

    def test_uncertain_scenario_fails_hard_and_confidence_gates(self) -> None:
        result = self.provider.inspect("uncertain", "wf-3", "pkg-3")
        policy = evaluate_policy(result)

        self.assertEqual("review_required", policy["decision"])
        self.assertIn("VISIBLE_DAMAGE_REQUIRES_REVIEW", policy["signals"])
        self.assertIn("LABEL_NOT_READABLE", policy["signals"])
        self.assertIn("LOW_CONFIDENCE_PACKAGE_TYPE", policy["signals"])
        self.assertIn("LOW_CONFIDENCE_OVERALL", policy["signals"])

    def test_provider_failure_is_distinct_retryable_and_fail_closed(self) -> None:
        result = self.provider.inspect("provider-failure", "wf-4", "pkg-4")
        policy = evaluate_policy(result)

        self.assertEqual("service_unavailable", result["status"])
        self.assertIsNone(result["analysis"])
        self.assertEqual("VISION_PROVIDER_UNAVAILABLE", result["error"]["code"])
        self.assertTrue(result["error"]["retryable"])
        self.assertEqual("review_required", policy["decision"])
        self.assertEqual("service_unavailable", policy["service_status"])

    def test_fixture_results_are_fresh_copies(self) -> None:
        first = self.provider.inspect("normal", "wf", "pkg")
        first["analysis"]["observations"]["visible_damage"] = "severe"

        second = self.provider.inspect("normal", "wf", "pkg")

        self.assertEqual("none", second["analysis"]["observations"]["visible_damage"])

    def test_image_registry_override_does_not_change_fixture_judgment(self) -> None:
        provider = FixtureVisionProvider(
            {"normal": {"image_url": "/images/custom-camera.png"}}
        )

        result = provider.inspect("normal", "wf", "pkg")

        self.assertEqual("/images/custom-camera.png", result["image_url"])
        self.assertEqual("none", result["analysis"]["observations"]["visible_damage"])

    def test_unknown_scenario_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "scenario_id"):
            self.provider.inspect("missing", "wf", "pkg")


class VisionPolicyTests(unittest.TestCase):
    def test_thresholds_are_inclusive_at_boundary(self) -> None:
        analysis = normal_analysis()
        for field in ("package_type", "size_class", "visible_damage", "label_readable"):
            analysis["confidence"][field] = CRITICAL_FIELD_CONFIDENCE
        analysis["confidence"]["overall"] = OVERALL_CONFIDENCE

        policy = evaluate_policy(completed_inspection(analysis))

        self.assertEqual("clear", policy["decision"])

    def test_confidence_just_below_each_threshold_requires_review(self) -> None:
        field_analysis = normal_analysis()
        field_analysis["confidence"]["size_class"] = CRITICAL_FIELD_CONFIDENCE - 0.01
        overall_analysis = normal_analysis()
        overall_analysis["confidence"]["overall"] = OVERALL_CONFIDENCE - 0.01

        field_policy = evaluate_policy(completed_inspection(field_analysis))
        overall_policy = evaluate_policy(completed_inspection(overall_analysis))

        self.assertIn("LOW_CONFIDENCE_SIZE_CLASS", field_policy["signals"])
        self.assertIn("LOW_CONFIDENCE_OVERALL", overall_policy["signals"])

    def test_hard_safety_observations_require_review(self) -> None:
        cases = (
            ("package_detected", False, "PACKAGE_NOT_DETECTED"),
            ("visible_damage", "minor", "VISIBLE_DAMAGE_REQUIRES_REVIEW"),
            ("visible_damage", "uncertain", "VISIBLE_DAMAGE_REQUIRES_REVIEW"),
            ("label_present", False, "LABEL_NOT_PRESENT"),
            ("label_readable", False, "LABEL_NOT_READABLE"),
        )
        for field, value, signal in cases:
            with self.subTest(field=field, value=value):
                analysis = normal_analysis()
                analysis["observations"][field] = value
                policy = evaluate_policy(completed_inspection(analysis))
                self.assertEqual("review_required", policy["decision"])
                self.assertIn(signal, policy["signals"])

    def test_large_package_is_advisory_only(self) -> None:
        analysis = normal_analysis()
        analysis["observations"]["size_class"] = "large"

        policy = evaluate_policy(completed_inspection(analysis))

        self.assertEqual("clear", policy["decision"])
        self.assertEqual(["POSSIBLE_OVERSIZED_PACKAGE"], policy["advisories"])

    def test_override_bypasses_field_gate_and_preserves_original(self) -> None:
        analysis = normal_analysis()
        analysis["observations"]["visible_damage"] = "uncertain"
        analysis["confidence"]["visible_damage"] = 0.20
        inspection = completed_inspection(analysis)
        original = deepcopy(inspection)

        policy = evaluate_policy(inspection, overrides={"visible_damage": "none"})

        self.assertEqual("clear", policy["decision"])
        self.assertEqual("none", policy["effective_observations"]["visible_damage"])
        self.assertEqual({"visible_damage": "none"}, policy["overrides_applied"])
        self.assertNotIn("LOW_CONFIDENCE_VISIBLE_DAMAGE", policy["signals"])
        self.assertEqual(original, inspection)

    def test_override_does_not_bypass_overall_confidence_gate(self) -> None:
        analysis = normal_analysis()
        analysis["confidence"]["visible_damage"] = 0.20
        analysis["confidence"]["overall"] = 0.70

        policy = evaluate_policy(
            completed_inspection(analysis), overrides={"visible_damage": "none"}
        )

        self.assertEqual("review_required", policy["decision"])
        self.assertNotIn("LOW_CONFIDENCE_VISIBLE_DAMAGE", policy["signals"])
        self.assertIn("LOW_CONFIDENCE_OVERALL", policy["signals"])

    def test_complete_human_correction_resolves_overall_uncertainty(self) -> None:
        analysis = normal_analysis()
        analysis["observations"].update(
            {
                "package_type": "unknown",
                "size_class": "unknown",
                "visible_damage": "uncertain",
                "label_readable": False,
            }
        )
        for field in ("package_type", "size_class", "visible_damage", "label_readable"):
            analysis["confidence"][field] = 0.40
        analysis["confidence"]["overall"] = 0.45

        policy = evaluate_policy(
            completed_inspection(analysis),
            overrides={
                "package_type": "cardboard_box",
                "size_class": "medium",
                "visible_damage": "none",
                "label_readable": True,
            },
        )

        self.assertEqual("clear", policy["decision"])
        self.assertNotIn("LOW_CONFIDENCE_OVERALL", policy["signals"])

    def test_unknown_override_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown vision override"):
            evaluate_policy(completed_inspection(), overrides={"confidence": 1.0})


class OpenAIVisionProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = Mock()
        self.client.responses.create = Mock()
        self.provider = OpenAIVisionProvider(
            {"camera-1": "data:image/jpeg;base64,ZmFrZQ=="},
            model="vision-test-model",
            timeout=7.5,
            client=self.client,
        )

    def response(self, analysis=None):
        return SimpleNamespace(
            id="resp-test",
            status="completed",
            output_text=json.dumps(analysis or normal_analysis()),
            output=[],
        )

    def test_responses_request_uses_image_strict_schema_and_no_storage(self) -> None:
        self.client.responses.create.return_value = self.response()

        result = self.provider.inspect("camera-1", "wf-live", "pkg-live")

        self.assertEqual("completed", result["status"])
        self.assertEqual("openai", result["provider"])
        self.assertEqual("openai", self.provider.mode)
        self.assertEqual("openai", result["provenance"]["mode"])
        self.assertEqual("vision-test-model", result["provenance"]["model"])
        self.assertEqual(PROMPT_VERSION, result["provenance"]["prompt_version"])
        self.assertEqual("resp-test", result["provenance"]["response_id"])
        self.assertGreaterEqual(result["provenance"]["latency_ms"], 0)
        self.assertIn("+00:00", result["provenance"]["captured_at"])
        kwargs = self.client.responses.create.call_args.kwargs
        self.assertEqual("vision-test-model", kwargs["model"])
        self.assertEqual(7.5, kwargs["timeout"])
        self.assertFalse(kwargs["store"])
        content = kwargs["input"][0]["content"]
        self.assertEqual("input_image", content[1]["type"])
        self.assertEqual("data:image/jpeg;base64,ZmFrZQ==", content[1]["image_url"])
        self.assertIn("untrusted visual data", content[0]["text"])
        text_format = kwargs["text"]["format"]
        self.assertEqual("json_schema", text_format["type"])
        self.assertTrue(text_format["strict"])
        self.assertIs(VISION_ANALYSIS_SCHEMA, text_format["schema"])
        self.assertFalse(VISION_ANALYSIS_SCHEMA["additionalProperties"])
        self.assertFalse(
            VISION_ANALYSIS_SCHEMA["properties"]["observations"]["additionalProperties"]
        )

    def test_local_image_path_override_is_encoded_for_responses_input(self) -> None:
        image_path = (
            Path(__file__).resolve().parents[1]
            / "site"
            / "public"
            / "images"
            / "orbis-warehouse-journey.jpg"
        )
        self.assertTrue(image_path.is_file())
        provider = OpenAIVisionProvider(
            {"local-camera": image_path}, client=self.client
        )
        self.client.responses.create.return_value = self.response()

        result = provider.inspect("local-camera", "wf", "pkg")

        self.assertEqual("completed", result["status"])
        image_url = self.client.responses.create.call_args.kwargs["input"][0]["content"][1][
            "image_url"
        ]
        self.assertTrue(image_url.startswith("data:image/jpeg;base64,"))

    def test_builtin_registry_has_public_urls_and_backend_paths(self) -> None:
        expected = {
            "normal": "/images/vision/package-normal.jpg",
            "damaged": "/images/vision/package-damaged.jpg",
            "uncertain": "/images/vision/package-uncertain.jpg",
        }
        for scenario_id, image_url in expected.items():
            with self.subTest(scenario_id=scenario_id):
                scenario = SCENARIO_REGISTRY[scenario_id]
                self.assertEqual(image_url, scenario["image_url"])
                self.assertIsInstance(scenario["image_path"], Path)
                self.assertTrue(scenario["image_path"].is_file())

    def test_builtin_scenario_path_is_resolved_without_live_call(self) -> None:
        provider = OpenAIVisionProvider(client=self.client)
        self.client.responses.create.return_value = self.response()

        result = provider.inspect("normal", "wf", "pkg")

        self.assertEqual("completed", result["status"])
        self.assertEqual("/images/vision/package-normal.jpg", result["image_url"])
        image_url = self.client.responses.create.call_args.kwargs["input"][0]["content"][1][
            "image_url"
        ]
        self.assertTrue(image_url.startswith("data:image/jpeg;base64,"))

    def test_transient_failure_is_retried_once_then_succeeds(self) -> None:
        self.client.responses.create.side_effect = [TimeoutError("slow"), self.response()]

        result = self.provider.inspect("camera-1", "wf", "pkg")

        self.assertEqual("completed", result["status"])
        self.assertEqual(2, self.client.responses.create.call_count)

    def test_transient_failure_stops_after_one_retry_without_fallback(self) -> None:
        self.client.responses.create.side_effect = TimeoutError("slow")

        result = self.provider.inspect("camera-1", "wf", "pkg")

        self.assertEqual(2, self.client.responses.create.call_count)
        self.assertEqual("service_unavailable", result["status"])
        self.assertEqual("openai", result["provider"])
        self.assertIsNone(result["analysis"])
        self.assertEqual("VISION_PROVIDER_TRANSIENT", result["error"]["code"])
        self.assertTrue(result["error"]["retryable"])

    def test_non_transient_failure_is_not_retried(self) -> None:
        self.client.responses.create.side_effect = RuntimeError("bad request")

        result = self.provider.inspect("camera-1", "wf", "pkg")

        self.assertEqual(1, self.client.responses.create.call_count)
        self.assertEqual("VISION_PROVIDER_ERROR", result["error"]["code"])
        self.assertFalse(result["error"]["retryable"])

    def test_invalid_schema_is_distinct_non_retryable_and_not_retried(self) -> None:
        invalid = normal_analysis()
        invalid["observations"]["unexpected"] = True
        self.client.responses.create.return_value = self.response(invalid)

        result = self.provider.inspect("camera-1", "wf", "pkg")

        self.assertEqual("service_unavailable", result["status"])
        self.assertEqual("VISION_RESPONSE_INVALID", result["error"]["code"])
        self.assertFalse(result["error"]["retryable"])
        self.assertEqual(1, self.client.responses.create.call_count)

    def test_refusal_is_non_retryable_and_not_retried(self) -> None:
        self.client.responses.create.return_value = SimpleNamespace(
            id="resp-refusal",
            status="completed",
            output_text="",
            output=[
                {
                    "type": "message",
                    "content": [{"type": "refusal", "refusal": "Unable to inspect."}],
                }
            ],
        )

        result = self.provider.inspect("camera-1", "wf", "pkg")

        self.assertEqual("VISION_RESPONSE_REFUSED", result["error"]["code"])
        self.assertFalse(result["error"]["retryable"])
        self.assertEqual(1, self.client.responses.create.call_count)

    def test_invalid_input_is_non_retryable_and_not_retried(self) -> None:
        class InvalidInputError(RuntimeError):
            status_code = 400

        self.client.responses.create.side_effect = InvalidInputError("invalid")

        result = self.provider.inspect("camera-1", "wf", "pkg")

        self.assertEqual("VISION_PROVIDER_REQUEST_INVALID", result["error"]["code"])
        self.assertFalse(result["error"]["retryable"])
        self.assertEqual(1, self.client.responses.create.call_count)

    def test_missing_image_source_fails_without_api_call(self) -> None:
        result = self.provider.inspect("unknown-camera", "wf", "pkg")

        self.assertEqual("VISION_IMAGE_NOT_CONFIGURED", result["error"]["code"])
        self.assertFalse(result["error"]["retryable"])
        self.client.responses.create.assert_not_called()

    def test_rejects_non_positive_timeout(self) -> None:
        with self.assertRaisesRegex(ValueError, "timeout"):
            OpenAIVisionProvider({}, timeout=0, client=self.client)

    def test_defaults_match_live_provider_plan(self) -> None:
        provider = OpenAIVisionProvider({}, client=self.client)

        self.assertEqual("gpt-5.4-mini", provider.model)
        self.assertEqual(15.0, provider.timeout)


if __name__ == "__main__":
    unittest.main()
