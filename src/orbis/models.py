"""Domain primitives shared by the orchestrator and physical agents."""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentStatus(str, Enum):
    AVAILABLE = "available"
    RESERVED = "reserved"
    EXECUTING = "executing"
    DEGRADED = "degraded"
    OFFLINE = "offline"


class StepStatus(str, Enum):
    PENDING = "pending"
    RESERVED = "reserved"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


class WorkflowStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    ATTENTION_REQUIRED = "attention_required"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class HandoffStatus(str, Enum):
    OFFERED = "offered"
    ACCEPTED = "accepted"


@dataclass
class Capability:
    name: str
    description: str
    constraints: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Evidence:
    id: str
    producer_id: str
    kind: str
    passed: bool
    confidence: float
    observations: Dict[str, Any]
    captured_at: str = field(default_factory=utc_now)


@dataclass
class ExecutionResult:
    success: bool
    evidence: List[Evidence]
    location: str
    package_status: str
    error_code: Optional[str] = None
    message: Optional[str] = None
    retryable: bool = True


@dataclass
class WorkflowStep:
    id: str
    name: str
    capability: str
    description: str
    preconditions: List[str]
    payload: Dict[str, Any]
    status: StepStatus = StepStatus.PENDING
    assigned_agent_id: Optional[str] = None
    attempt: int = 0
    evidence: List[Evidence] = field(default_factory=list)
    error: Optional[Dict[str, Any]] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


@dataclass
class Handoff:
    id: str
    object_id: str
    from_agent_id: str
    to_agent_id: str
    workflow_id: str
    from_step_id: str
    to_step_id: str
    evidence_ids: List[str]
    status: HandoffStatus = HandoffStatus.OFFERED
    offered_at: str = field(default_factory=utc_now)
    accepted_at: Optional[str] = None


@dataclass
class PackageState:
    id: str
    order_id: str
    status: str
    location: str
    custodian_id: str
    destination: str
    version: int = 1
    updated_at: str = field(default_factory=utc_now)


@dataclass
class Event:
    sequence: int
    type: str
    workflow_id: str
    message: str
    data: Dict[str, Any] = field(default_factory=dict)
    occurred_at: str = field(default_factory=utc_now)


@dataclass
class Workflow:
    id: str
    order_id: str
    package_id: str
    destination: str
    steps: List[WorkflowStep]
    status: WorkflowStatus = WorkflowStatus.PENDING
    current_step_index: int = 0
    handoffs: List[Handoff] = field(default_factory=list)
    events: List[Event] = field(default_factory=list)
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)


def to_primitive(value: Any) -> Any:
    """Convert nested dataclasses and enums to JSON-compatible values."""
    if isinstance(value, Enum):
        return value.value
    if hasattr(value, "__dataclass_fields__"):
        return to_primitive(asdict(value))
    if isinstance(value, dict):
        return {key: to_primitive(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_primitive(item) for item in value]
    return value

