"""FastAPI transport for Orbis while preserving the original demo routes."""

import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings
from .coordinator import Coordinator, CoordinatorError
from .engine import OrchestrationError
from .home import HomeWorkerRegistry, HomeWorkerError
from .outcomes import OutcomeCoordinator, OutcomeError
from .vision import FixtureVisionProvider, OpenAIVisionProvider, SCENARIO_REGISTRY


WEB_ROOT = Path(__file__).resolve().parents[2] / "web"


class RequestEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    request_id: str = Field(min_length=1, max_length=160)


class WorkflowCreateRequest(RequestEnvelope):
    order_id: str = Field(min_length=1)
    package_id: str = Field(min_length=1)
    destination: str = Field(min_length=1)
    scenario_id: str = "normal"
    trailer_id: str = "truck-17"
    vision_mode: Optional[str] = None
    auto_start: bool = False


class WorkflowActionRequest(RequestEnvelope):
    vision_mode: Optional[str] = None


class InspectionCreateRequest(RequestEnvelope):
    workflow_id: str = Field(min_length=1)
    object_id: Optional[str] = None
    scenario_id: Optional[str] = None
    vision_mode: Optional[str] = None


class InspectionReviewRequest(RequestEnvelope):
    actor_id: str = "human-inspector-demo"
    disposition: str = Field(min_length=1)
    corrections: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class OutcomePlanCreateRequest(RequestEnvelope):
    objective: str = Field(min_length=1)
    scenario: str = "home_dinner"
    constraints: Dict[str, Any] = Field(default_factory=dict)


class OutcomePlanApprovalRequest(RequestEnvelope):
    approve_purchase: bool
    approve_execution: bool
    actor_id: str = "host-demo"
    high_risk_cooking: str = "human_approval_required"


class OutcomeStartRequest(RequestEnvelope):
    scenario_id: str = "normal"


class OutcomeActionRequest(RequestEnvelope):
    action: str = Field(min_length=1)
    actor_id: str = "host-demo"
    target_id: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)


def _request_payload(value: BaseModel) -> Dict[str, Any]:
    return value.model_dump(exclude={"request_id"}, exclude_none=True)


def _error_payload(
    request_id: Optional[str],
    code: str,
    message: str,
    retryable: bool,
    details: Optional[Any] = None,
) -> Dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "details": details,
        },
        "request_id": request_id,
    }


def _request_id(request: Request) -> Optional[str]:
    value = getattr(request.state, "request_id", None)
    if value:
        return str(value)
    return request.headers.get("X-Request-Id")


def _mutation_response(
    coordinator: Coordinator,
    operation: str,
    request_id: str,
    content: Any,
    status_code: int = 200,
) -> JSONResponse:
    replayed = bool(
        coordinator.idempotency_metadata(request_id, operation).get("replayed")
    )
    headers = {"Idempotent-Replay": "true" if replayed else "false"}
    return JSONResponse(status_code=status_code, content=content, headers=headers)


def _build_coordinator(settings: Settings) -> Coordinator:
    fixture = FixtureVisionProvider()
    if settings.vision_mode == "fixture":
        return Coordinator(
            vision_provider=fixture,
            vision_providers={"fixture": fixture},
        )

    live = OpenAIVisionProvider(
        model=settings.vision_model,
        timeout=settings.vision_timeout_seconds,
    )
    return Coordinator(
        vision_provider=live,
        vision_providers={"openai": live, "fixture": fixture},
    )


def create_app(
    coordinator: Optional[Coordinator] = None,
    settings: Optional[Settings] = None,
    *,
    outcome_coordinator: Optional[OutcomeCoordinator] = None,
    mount_console: bool = True,
) -> FastAPI:
    settings = settings or Settings.from_environment()
    coordinator = coordinator or _build_coordinator(settings)
    outcome_coordinator = outcome_coordinator or OutcomeCoordinator(coordinator)
    home_workers = HomeWorkerRegistry()
    app = FastAPI(
        title="Orbis Vision and Orchestration API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.coordinator = coordinator
    app.state.outcome_coordinator = outcome_coordinator
    app.state.home_workers = home_workers
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-Id"],
        expose_headers=["Idempotent-Replay"],
    )

    @app.middleware("http")
    async def remember_request_id(request: Request, call_next: Any) -> Any:
        request.state.request_id = request.headers.get("X-Request-Id")
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            try:
                body = await request.body()
                if body and request.headers.get("content-type", "").startswith(
                    "application/json"
                ):
                    import json

                    value = json.loads(body)
                    if isinstance(value, dict) and value.get("request_id"):
                        request.state.request_id = str(value["request_id"])
            except Exception:
                pass
        return await call_next(request)

    @app.exception_handler(CoordinatorError)
    async def coordinator_error(request: Request, exc: CoordinatorError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(
                _request_id(request),
                exc.code,
                str(exc),
                exc.status_code >= 500 or "RETRY" in exc.code,
            ),
        )

    @app.exception_handler(OutcomeError)
    async def outcome_error(request: Request, exc: OutcomeError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(
                _request_id(request),
                exc.code,
                str(exc),
                exc.status_code >= 500 or "RETRY" in exc.code,
            ),
        )

    @app.exception_handler(HomeWorkerError)
    async def home_worker_error(request: Request, exc: HomeWorkerError) -> JSONResponse:
        status_code = 404 if exc.code == "WORKER_NOT_FOUND" else 409
        return JSONResponse(
            status_code=status_code,
            content=_error_payload(_request_id(request), exc.code, str(exc), False),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_payload(
                _request_id(request),
                "INVALID_REQUEST",
                "The request did not match the API contract.",
                False,
                exc.errors(),
            ),
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=_error_payload(
                _request_id(request),
                "INTERNAL_ERROR",
                "The service could not complete the request.",
                True,
            ),
        )

    # -- Original unversioned API -----------------------------------------

    @app.get("/api/health")
    def legacy_health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "orbis",
            "version": "1.0.0",
            "vision_mode": settings.vision_mode,
            "vision_model": settings.vision_model,
            "key_configured": settings.key_configured,
        }

    @app.get("/api/state")
    def legacy_state() -> Dict[str, Any]:
        return coordinator.orchestrator.snapshot()

    @app.get("/api/workflows/{workflow_id}")
    def legacy_get_workflow(workflow_id: str) -> Any:
        try:
            return coordinator.orchestrator.workflow_snapshot(workflow_id)
        except OrchestrationError as exc:
            return JSONResponse(status_code=404, content={"error": str(exc)})

    @app.post("/api/workflows")
    def legacy_create_workflow(payload: Dict[str, Any] = Body(default={})) -> Any:
        try:
            workflow = coordinator.orchestrator.create_warehouse_workflow(
                order_id=str(payload.get("order_id", "")).strip(),
                package_id=str(payload.get("package_id", "")).strip(),
                destination=str(payload.get("destination", "")).strip(),
                trailer_id=str(payload.get("trailer_id", "truck-17")).strip(),
            )
            fail_at = payload.get("fail_at")
            failure_agents = {
                "packing": ("packing-arm-01", "pack_and_verify"),
                "transport": ("amr-01", "move_package"),
                "loading": ("loading-station-01", "load_vehicle"),
            }
            if fail_at:
                target = failure_agents.get(str(fail_at))
                if target is None:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "error": "fail_at must be packing, transport, or loading"
                        },
                    )
                coordinator.orchestrator.inject_failure(*target)
            if payload.get("auto_start", True):
                coordinator.orchestrator.start(workflow.id)
            return JSONResponse(
                status_code=201,
                content=coordinator.orchestrator.workflow_snapshot(workflow.id),
            )
        except OrchestrationError as exc:
            return JSONResponse(status_code=409, content={"error": str(exc)})

    @app.post("/api/workflows/{workflow_id}/start")
    def legacy_start_workflow(workflow_id: str) -> Any:
        try:
            coordinator.orchestrator.start(workflow_id)
            return JSONResponse(
                status_code=202,
                content={"workflow_id": workflow_id, "status": "started"},
            )
        except OrchestrationError as exc:
            return JSONResponse(status_code=409, content={"error": str(exc)})

    @app.post("/api/workflows/{workflow_id}/retry")
    def legacy_retry_workflow(workflow_id: str) -> Any:
        try:
            coordinator.orchestrator.retry(workflow_id)
            return JSONResponse(
                status_code=202,
                content={"workflow_id": workflow_id, "status": "retrying"},
            )
        except OrchestrationError as exc:
            return JSONResponse(status_code=409, content={"error": str(exc)})

    # -- Versioned application API ----------------------------------------

    @app.get("/api/v1/system")
    def system_view() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "orbis",
            "api_version": "v1",
            "vision_mode": settings.vision_mode,
            "vision_model": settings.vision_model,
            "key_configured": settings.key_configured,
            "live_updates": "polling",
            "poll_interval_ms": 750,
        }

    @app.get("/api/v1/workers")
    def list_workers() -> Dict[str, Any]:
        return {"workers": coordinator.list_workers()}

    @app.get("/api/v1/workers/{worker_id}")
    def get_worker(worker_id: str) -> Dict[str, Any]:
        return coordinator.get_worker(worker_id)

    @app.get("/api/v1/home/workers")
    def list_home_workers() -> Dict[str, Any]:
        return {"workers": home_workers.snapshot()}

    @app.get("/api/v1/home/workers/{worker_id}")
    def get_home_worker(worker_id: str) -> Dict[str, Any]:
        return home_workers.get(worker_id).snapshot()

    @app.get("/api/v1/vision/scenarios")
    def list_scenarios() -> Dict[str, Any]:
        scenarios = coordinator.list_scenarios()
        for scenario in scenarios:
            registry_value = SCENARIO_REGISTRY.get(str(scenario.get("id")), {})
            scenario.setdefault("image_url", registry_value.get("image_url"))
        return {"scenarios": scenarios}

    @app.post("/api/v1/vision/inspections")
    def create_inspection(body: InspectionCreateRequest) -> JSONResponse:
        payload = _request_payload(body)
        result = coordinator.create_inspection(payload, body.request_id)
        return _mutation_response(
            coordinator,
            "create_inspection",
            body.request_id,
            result,
            201,
        )

    @app.get("/api/v1/vision/inspections/{inspection_id}")
    def get_inspection(inspection_id: str) -> Dict[str, Any]:
        return coordinator.get_inspection(inspection_id)

    @app.post("/api/v1/vision/inspections/{inspection_id}/reviews")
    def review_inspection(
        inspection_id: str, body: InspectionReviewRequest
    ) -> JSONResponse:
        payload = {
            "reviewer_id": body.actor_id,
            "resolution": body.disposition,
            "overrides": body.corrections,
            "notes": body.notes,
        }
        result = coordinator.review_inspection(
            inspection_id, payload, body.request_id
        )
        return _mutation_response(
            coordinator,
            "review_inspection",
            body.request_id,
            result,
        )

    @app.post("/api/v1/workflows")
    def create_workflow(body: WorkflowCreateRequest) -> JSONResponse:
        result = coordinator.create_workflow(
            _request_payload(body), body.request_id
        )
        return _mutation_response(
            coordinator,
            "create_workflow",
            body.request_id,
            result,
            201,
        )

    @app.get("/api/v1/workflows/{workflow_id}")
    def get_workflow(workflow_id: str) -> Dict[str, Any]:
        return coordinator.get_workflow(workflow_id)

    @app.post("/api/v1/workflows/{workflow_id}/start")
    def start_workflow(
        workflow_id: str, body: WorkflowActionRequest
    ) -> JSONResponse:
        result = coordinator.start_workflow(
            workflow_id, body.request_id, body.vision_mode
        )
        return _mutation_response(
            coordinator,
            "start_workflow",
            body.request_id,
            result,
            202,
        )

    @app.post("/api/v1/workflows/{workflow_id}/retry")
    def retry_workflow(
        workflow_id: str, body: WorkflowActionRequest
    ) -> JSONResponse:
        result = coordinator.retry_workflow(
            workflow_id, body.request_id, body.vision_mode
        )
        return _mutation_response(
            coordinator,
            "retry_workflow",
            body.request_id,
            result,
            202,
        )

    @app.get("/api/v1/workflows/{workflow_id}/events")
    def workflow_events(
        workflow_id: str, after_sequence: int = Query(default=0, ge=0)
    ) -> Dict[str, Any]:
        return coordinator.events(workflow_id, after_sequence)

    # -- Outcome orchestration API ---------------------------------------

    @app.post("/api/v1/outcome-plans")
    def create_outcome_plan(body: OutcomePlanCreateRequest) -> JSONResponse:
        result = outcome_coordinator.create_plan(_request_payload(body), body.request_id)
        return _mutation_response(
            outcome_coordinator, "create_plan", body.request_id, result, 201
        )

    @app.get("/api/v1/outcome-plans/{plan_id}")
    def get_outcome_plan(plan_id: str) -> Dict[str, Any]:
        return outcome_coordinator.get_plan(plan_id)

    @app.post("/api/v1/outcome-plans/{plan_id}/approve")
    def approve_outcome_plan(
        plan_id: str, body: OutcomePlanApprovalRequest
    ) -> JSONResponse:
        result = outcome_coordinator.approve_plan(
            plan_id, _request_payload(body), body.request_id
        )
        return _mutation_response(
            outcome_coordinator, "approve_plan", body.request_id, result, 201
        )

    @app.get("/api/v1/outcomes")
    def list_outcomes() -> Dict[str, Any]:
        return outcome_coordinator.list_outcomes()

    @app.get("/api/v1/outcomes/{outcome_id}/history")
    def outcome_history(outcome_id: str) -> Dict[str, Any]:
        return outcome_coordinator.history(outcome_id)

    @app.get("/api/v1/outcomes/{outcome_id}/snapshots/{sequence}")
    def outcome_snapshot(outcome_id: str, sequence: int) -> Dict[str, Any]:
        return outcome_coordinator.snapshot(outcome_id, sequence)

    @app.get("/api/v1/outcomes/{outcome_id}")
    def get_outcome(outcome_id: str) -> Dict[str, Any]:
        return outcome_coordinator.get_outcome(outcome_id)

    @app.post("/api/v1/outcomes/{outcome_id}/start")
    def start_outcome(outcome_id: str, body: OutcomeStartRequest) -> JSONResponse:
        result = outcome_coordinator.start_outcome(
            outcome_id, _request_payload(body), body.request_id
        )
        return _mutation_response(
            outcome_coordinator, "start_outcome", body.request_id, result, 202
        )

    @app.post("/api/v1/outcomes/{outcome_id}/actions")
    def submit_outcome_action(
        outcome_id: str, body: OutcomeActionRequest
    ) -> JSONResponse:
        result = outcome_coordinator.apply_action(
            outcome_id, _request_payload(body), body.request_id
        )
        return _mutation_response(
            outcome_coordinator, "outcome_action", body.request_id, result
        )

    @app.get("/api/v1/outcomes/{outcome_id}/events")
    def outcome_events(
        outcome_id: str, after_sequence: int = Query(default=0, ge=0)
    ) -> Dict[str, Any]:
        return outcome_coordinator.events(outcome_id, after_sequence)

    if mount_console and WEB_ROOT.is_dir():
        app.mount("/", StaticFiles(directory=str(WEB_ROOT), html=True), name="console")
    return app


app = create_app()


def main() -> None:
    import uvicorn

    settings = Settings.from_environment()
    uvicorn.run(
        "orbis.api:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=os.environ.get("ORBIS_LOG_LEVEL", "info"),
    )


if __name__ == "__main__":
    main()
