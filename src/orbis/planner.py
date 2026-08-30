"""Prompt-to-plan intelligence for proof-gated physical orchestration.

The planner deliberately produces outcome-level task envelopes. Robot-local
controllers remain responsible for motion planning and certified safety.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from uuid import uuid4

from .models import utc_now


PHASES = ("parallel", "linehaul", "handoff", "home_finish")


@dataclass(frozen=True)
class AgentProfile:
    id: str
    name: str
    environment: str
    capabilities: Tuple[str, ...]
    constraints: Tuple[str, ...]


@dataclass
class PlannedTask:
    id: str
    title: str
    description: str
    capability: str
    assigned_agent_id: str
    environment: str
    wave: str
    dependencies: List[str]
    resource: str
    required_evidence: str
    rationale: str


@dataclass
class ExecutionWave:
    index: int
    id: str
    label: str
    task_ids: List[str]
    starts_when: str
    execution: str = "parallel"


@dataclass
class GuardrailDecision:
    id: str
    title: str
    status: str
    detail: str
    task_ids: List[str] = field(default_factory=list)


@dataclass
class OrchestrationPlan:
    id: str
    objective: str
    environment: str
    scenario_id: str
    scenario_title: str
    end_state: str
    confidence: float
    reasoning: List[str]
    assumptions: List[str]
    tasks: List[PlannedTask]
    waves: List[ExecutionWave]
    guardrails: List[GuardrailDecision]
    requires_approval: bool
    blocked: bool
    created_at: str = field(default_factory=utc_now)


def default_agent_registry() -> Dict[str, AgentProfile]:
    profiles = [
        AgentProfile("warehouse-cell", "Robots R1-R3", "warehouse", ("pick_scan_pack",), ("20 kg parcel limit",)),
        AgentProfile("delivery-fleet", "Robots R4-R5", "warehouse", ("autonomous_delivery", "custody_handoff"), ("Approved address required",)),
        AgentProfile("loader-h1", "Loader Rover H1", "home", ("vacuum_floor", "scan_floor_path"), ("Floor surfaces only",)),
        AgentProfile("humanoid-h2", "Humanoid H2", "home", ("accept_delivery", "carry_household_items", "put_away_items", "prepare_surfaces"), ("12 kg carry limit",)),
        AgentProfile("table-h3", "Adaptive Table H3", "home", ("move_table",), ("Clear path and exclusive dining-zone lease required",)),
        AgentProfile("chairs-h4", "Chair Fleet H4", "home", ("arrange_chairs",), ("Final table pose required",)),
        AgentProfile("lamps-h5", "Assistant Lamps H5", "home", ("set_light_scene",), ("Occupancy-safe aiming envelope required",)),
    ]
    return {profile.id: profile for profile in profiles}


def _task(
    task_id: str,
    title: str,
    description: str,
    capability: str,
    agent_id: str,
    environment: str,
    wave: str,
    dependencies: Sequence[str],
    resource: str,
    evidence: str,
    rationale: str,
) -> PlannedTask:
    return PlannedTask(
        task_id,
        title,
        description,
        capability,
        agent_id,
        environment,
        wave,
        list(dependencies),
        resource,
        evidence,
        rationale,
    )


def _warehouse_tasks() -> List[PlannedTask]:
    return [
        _task(
            "wh-fulfill",
            "Pick, scan, and pack order",
            "Identify every approved item and seal a verified package.",
            "pick_scan_pack",
            "warehouse-cell",
            "warehouse",
            "parallel",
            (),
            "packing-cell-a",
            "SKU, quantity, weight, label, and seal evidence",
            "R1-R3 are the only connected agents that prove the full pick-to-seal outcome.",
        ),
        _task(
            "wh-deliver",
            "Dispatch and deliver order",
            "Transport the verified package to the approved address.",
            "autonomous_delivery",
            "delivery-fleet",
            "warehouse",
            "linehaul",
            ("wh-fulfill",),
            "approved-delivery-route",
            "Route trace, package identity, arrival pose, and delivery proof",
            "R4-R5 expose both autonomous delivery and custody-handoff capabilities.",
        ),
    ]


def _guest_count(objective: str, fallback: int) -> int:
    match = re.search(r"(?:for|ready for)\s+(\d{1,2})", objective, re.IGNORECASE)
    return int(match.group(1)) if match else fallback


def _dinner_tasks(objective: str) -> Tuple[List[PlannedTask], str]:
    count = _guest_count(objective, 12)
    tasks = _warehouse_tasks() + [
        _task("home-clear", "Scan and clean shared floor", "Publish safe paths before furniture moves.", "scan_floor_path", "loader-h1", "home", "parallel", (), "ground-floor", "Occupancy scan, clean-floor proof, and path map", "H1 is floor-rated and produces the path evidence required by mobile furniture."),
        _task("home-table", "Position dining table", "Move and raise the table for the requested place settings.", "move_table", "table-h3", "home", "linehaul", ("home-clear",), "dining-zone", "Final table pose, height, and clearance map", "H3 is the only agent certified to translate and height-adjust this table."),
        _task("home-chairs", "Arrange chairs", "Create even spacing while preserving the egress aisle.", "arrange_chairs", "chairs-h4", "home", "handoff", ("home-table",), "dining-perimeter", "Chair count, spacing, and egress proof", "H4 consumes H3's final table pose and coordinates the chair fleet."),
        _task("home-accept", "Accept grocery custody", "Match and accept the delivered package at the door.", "accept_delivery", "humanoid-h2", "home", "handoff", ("wh-deliver",), "entry-handoff-zone", "Two-party package identity and custody receipt", "H2 is registered as the home custody recipient and can manipulate the package."),
        _task("home-stage", "Stage groceries and tableware", "Carry groceries to the kitchen and prepare the table.", "prepare_surfaces", "humanoid-h2", "home", "home_finish", ("home-accept", "home-table"), "kitchen-and-table", "Item placement and clear-surface images", "H2 combines household carrying and surface-preparation capabilities."),
        _task("home-lights", "Set dinner lighting", "Apply a warm light scene after furniture stops moving.", "set_light_scene", "lamps-h5", "home", "home_finish", ("home-chairs",), "lighting-control-plane", "Scene state, aim envelope, and illumination proof", "H5 can verify illumination without entering a furniture motion zone."),
    ]
    return tasks, "Groceries are delivered and accepted; the ground floor and a {}-seat dining setup are clean, arranged, staged, and warmly lit.".format(count)


def _grocery_tasks() -> Tuple[List[PlannedTask], str]:
    tasks = _warehouse_tasks() + [
        _task("home-clear", "Clear entry and pantry route", "Scan and clean the door-to-pantry route.", "scan_floor_path", "loader-h1", "home", "parallel", (), "entry-pantry-route", "Obstacle-free route and clean-floor proof", "H1 is the only floor-rated robot that can certify the path."),
        _task("home-accept", "Accept grocery custody", "Validate and accept the order at the door.", "accept_delivery", "humanoid-h2", "home", "handoff", ("wh-deliver", "home-clear"), "entry-handoff-zone", "Package match and custody receipt", "H2 is the registered recipient and can carry the package."),
        _task("home-putaway", "Put groceries away", "Place shelf-stable goods in approved pantry locations.", "put_away_items", "humanoid-h2", "home", "home_finish", ("home-accept",), "pantry", "Item count and destination-shelf images", "H2 exposes household put-away; restricted items remain staged."),
    ]
    return tasks, "The approved order is delivered through a verified handoff and shelf-stable groceries are placed in saved pantry locations."


def _guest_ready_tasks(objective: str) -> Tuple[List[PlannedTask], str]:
    count = _guest_count(objective, 8)
    tasks = [
        _task("home-clear", "Clean floors and map paths", "Clean common floors and publish furniture paths.", "scan_floor_path", "loader-h1", "home", "parallel", (), "entry-living-room", "Clean-floor and obstruction map", "H1 owns floor cleaning and safe-path evidence."),
        _task("home-surfaces", "Clear and prepare surfaces", "Move only approved clutter and stage linens.", "prepare_surfaces", "humanoid-h2", "home", "parallel", (), "kitchen-counters", "Before/after images and exception list", "H2 works concurrently in a separately leased zone."),
        _task("home-table", "Position dining table", "Move the table after the floor route clears.", "move_table", "table-h3", "home", "linehaul", ("home-clear",), "dining-zone", "Final table pose and clearance", "H3 consumes H1's safe path map."),
        _task("home-chairs", "Arrange chairs", "Place chairs from the final table pose.", "arrange_chairs", "chairs-h4", "home", "handoff", ("home-table",), "dining-perimeter", "Chair count, spacing, and egress proof", "H4 starts only after H3 publishes the exact pose."),
        _task("home-finish", "Finish guest details", "Place approved linens and verify every place.", "prepare_surfaces", "humanoid-h2", "home", "home_finish", ("home-surfaces", "home-chairs"), "dining-surface", "Place-setting count and clear-surface proof", "H2 returns after all mobile furniture stops."),
        _task("home-lights", "Set evening lighting", "Aim a comfortable guest scene.", "set_light_scene", "lamps-h5", "home", "home_finish", ("home-chairs",), "lighting-control-plane", "Scene state and illumination proof", "H5 uses final furniture geometry for safe aiming."),
    ]
    return tasks, "Common areas are clean; the dining layout is verified for {}; surfaces and evening lighting are ready.".format(count)


def _simultaneous_tasks() -> Tuple[List[PlannedTask], str]:
    tasks = [
        _task("reset-entry", "Clean entry floors", "Vacuum the entry zone.", "vacuum_floor", "loader-h1", "home", "parallel", (), "entry-zone", "Clean-floor and occupancy proof", "H1 is floor-rated and isolated from all other assignments."),
        _task("reset-kitchen", "Tidy kitchen surfaces", "Return approved items to saved locations.", "prepare_surfaces", "humanoid-h2", "home", "parallel", (), "kitchen-counters", "Before/after images and exception list", "H2 operates inside a separate kitchen lease."),
        _task("reset-table", "Align dining table", "Return the table to its saved pose.", "move_table", "table-h3", "home", "parallel", (), "dining-center", "Pose, clearance, and brake proof", "H3 owns the dining center while H4 works in another room."),
        _task("reset-chairs", "Reset living-room chairs", "Return lounge chairs to saved positions.", "arrange_chairs", "chairs-h4", "home", "parallel", (), "living-room", "Chair pose and aisle proof", "H4 receives a non-overlapping room lease."),
        _task("reset-lights", "Set calm lighting", "Restore the saved evening scene.", "set_light_scene", "lamps-h5", "home", "parallel", (), "lighting-control-plane", "Scene state and illumination proof", "H5 changes light state without entering a motion zone."),
    ]
    return tasks, "Five independently leased home zones return to their saved clean, tidy, aligned, and calmly lit state."


def _package_tasks() -> Tuple[List[PlannedTask], str]:
    tasks = _warehouse_tasks() + [
        _task("home-clear", "Prepare entry handoff zone", "Publish a safe receiving pose.", "scan_floor_path", "loader-h1", "home", "parallel", (), "entry-handoff-zone", "Door clearance, occupancy, and receiving-pose proof", "H1 certifies the receiving floor zone without manipulating the package."),
        _task("home-accept", "Accept package custody", "Match the parcel and accept custody after sender release.", "accept_delivery", "humanoid-h2", "home", "handoff", ("wh-deliver", "home-clear"), "entry-handoff-zone", "Two-party custody receipt and safe-lift proof", "H2 is the registered home recipient with package manipulation capability."),
        _task("home-place", "Place package inside", "Carry it to the saved indoor drop zone.", "carry_household_items", "humanoid-h2", "home", "home_finish", ("home-accept",), "indoor-drop-zone", "Package identity, final pose, and clear-surface proof", "H2 retains custody through the short indoor carry."),
    ]
    return tasks, "The approved order is delivered, accepted through a two-party custody handshake, and placed intact in the saved indoor drop zone."


class OrchestratorIntelligence:
    """Deterministic reference planner for the simulator's supported scenarios."""

    def __init__(self, agents: Optional[Iterable[AgentProfile]] = None) -> None:
        self.agents = default_agent_registry()
        if agents is not None:
            self.agents = {agent.id: agent for agent in agents}

    def scenarios(self) -> List[Dict[str, object]]:
        return [
            {"id": "dinner_delivery", "title": "Dinner + delivery", "environments": ["warehouse", "home"]},
            {"id": "grocery_restock", "title": "Grocery restock", "environments": ["warehouse", "home"]},
            {"id": "guest_ready", "title": "Guest-ready home", "environments": ["home"]},
            {"id": "simultaneous_reset", "title": "Whole-home reset", "environments": ["home"]},
            {"id": "package_handoff", "title": "Package handoff", "environments": ["warehouse", "home"]},
        ]

    def analyze(self, objective: str, environment: str = "home") -> OrchestrationPlan:
        value = objective.strip()
        if not value:
            raise ValueError("objective is required")
        if environment != "home":
            raise ValueError("the intelligence-layer simulation currently supports the home environment")

        normalized = value.lower()
        if re.search(r"simultaneous|simultaneously|at the same time|parallel", normalized):
            scenario_id, scenario_title, confidence = "simultaneous_reset", "Whole-home reset", 0.92
            tasks, end_state = _simultaneous_tasks()
            reasoning = ["The prompt explicitly requests simultaneous work.", "All five assignments use independent resources.", "The compiler selected one five-task parallel wave."]
        elif re.search(r"dinner|meal|party", normalized) and re.search(r"grocer|buy|order|deliver|purchase", normalized):
            scenario_id, scenario_title, confidence = "dinner_delivery", "Dinner + delivery", 0.97
            tasks, end_state = _dinner_tasks(value)
            reasoning = ["The request combines external fulfillment with home preparation.", "Packing and floor cleaning share no resources and begin together.", "Only path, furniture-pose, and custody evidence create dependencies."]
        elif re.search(r"pantry|restock|put (?:the |them )?away", normalized) and re.search(r"grocer|deliver|order|buy", normalized):
            scenario_id, scenario_title, confidence = "grocery_restock", "Grocery restock", 0.95
            tasks, end_state = _grocery_tasks()
            reasoning = ["The end state spans delivery and home put-away.", "The entry route can be prepared during fulfillment.", "Custody proof is the only cross-workflow dependency."]
        elif re.search(r"package|household order|doorstep|handoff", normalized) and re.search(r"deliver|order|accept|receive", normalized):
            scenario_id, scenario_title, confidence = "package_handoff", "Package handoff", 0.93
            tasks, end_state = _package_tasks()
            reasoning = ["The request is primarily a custody chain.", "Entry preparation can run during fulfillment.", "The same home robot retains custody through indoor placement."]
        else:
            scenario_id, scenario_title = "guest_ready", "Guest-ready home"
            tasks, end_state = _guest_ready_tasks(value)
            matched = bool(re.search(r"guest|dinner|party|ready|prepare|arrange|clean|tidy|reset", normalized))
            confidence = 0.94 if matched else 0.68
            reasoning = ["The request stays inside the home fleet.", "Floor and surface work start concurrently in exclusive zones.", "Final table pose gates chairs and place settings."]

        guardrails = self._evaluate_guardrails(value, tasks)
        return OrchestrationPlan(
            id="plan_{}".format(uuid4().hex[:10]),
            objective=value,
            environment=environment,
            scenario_id=scenario_id,
            scenario_title=scenario_title,
            end_state=end_state,
            confidence=confidence,
            reasoning=reasoning,
            assumptions=["Saved room poses, approved item locations, and robot calibrations are current.", "People and pets remain outside active motion zones."],
            tasks=tasks,
            waves=self._compile_waves(tasks),
            guardrails=guardrails,
            requires_approval=any(item.status == "gated" for item in guardrails),
            blocked=any(item.status == "blocked" for item in guardrails),
        )

    def _compile_waves(self, tasks: Sequence[PlannedTask]) -> List[ExecutionWave]:
        labels = {"parallel": "Parallel start", "linehaul": "Transport and layout", "handoff": "Custody and arrangement", "home_finish": "Home finish"}
        rules = {"parallel": "Plan approved and all leases acquired", "linehaul": "Required first-wave evidence accepted", "handoff": "Arrival or furniture-pose dependency satisfied", "home_finish": "Handoff and layout evidence accepted"}
        result = []
        for index, phase in enumerate(PHASES, 1):
            task_ids = [task.id for task in tasks if task.wave == phase]
            if task_ids:
                result.append(ExecutionWave(index, phase, labels[phase], task_ids, rules[phase]))
        return result

    def _evaluate_guardrails(self, objective: str, tasks: Sequence[PlannedTask]) -> List[GuardrailDecision]:
        decisions = [
            GuardrailDecision("capability", "Hard capability match", "passed", "Every assignment must match an advertised capability; proximity never overrides capability."),
            GuardrailDecision("health", "Health and reservation", "passed", "Every robot must be online, calibrated, and exclusively reserved before release."),
            GuardrailDecision("local_safety", "Robot-local safety authority", "passed", "Orbis delegates outcomes, while each robot retains collision avoidance and safe-stop authority."),
            GuardrailDecision("zone_leases", "Spatial conflict prevention", "passed", "Concurrent tasks require non-overlapping zone and object leases."),
            GuardrailDecision("proof", "Proof before completion", "passed", "Task success requires policy-compliant evidence; timers and claims are insufficient."),
            GuardrailDecision("substitution", "No unsafe substitution", "passed", "Replanning may use only another qualified robot; otherwise work pauses."),
        ]

        missing = [task.id for task in tasks if task.assigned_agent_id not in self.agents or task.capability not in self.agents[task.assigned_agent_id].capabilities]
        if missing:
            decisions[0] = GuardrailDecision("capability", "Hard capability match", "blocked", "At least one task has no qualified connected robot.", missing)

        task_ids = {task.id for task in tasks}
        invalid_dependencies = [task.id for task in tasks if any(dependency not in task_ids for dependency in task.dependencies)]
        cyclic = self._has_cycle(tasks)
        if invalid_dependencies or cyclic:
            affected = invalid_dependencies or [task.id for task in tasks]
            decisions.append(GuardrailDecision("dependency_graph", "Valid dependency graph", "blocked", "Dependencies must exist and the execution graph must be acyclic.", affected))
        else:
            decisions.append(GuardrailDecision("dependency_graph", "Valid dependency graph", "passed", "All dependencies resolve to earlier proof-producing tasks and the graph is acyclic."))

        conflicts: List[str] = []
        for phase in PHASES:
            resources: Dict[str, str] = {}
            for task in (item for item in tasks if item.wave == phase):
                if task.resource in resources:
                    conflicts.extend([resources[task.resource], task.id])
                resources[task.resource] = task.id
        if conflicts:
            decisions[3] = GuardrailDecision("zone_leases", "Spatial conflict prevention", "blocked", "Two same-wave tasks request the same exclusive resource.", sorted(set(conflicts)))

        purchasing = bool(re.search(r"buy|purchase|order|grocer|deliver", objective, re.IGNORECASE))
        if purchasing:
            budget = re.search(r"(?:under|up to|budget(?: of)?|\$)\s*\$?([0-9]{2,5})", objective, re.IGNORECASE)
            status = "passed" if budget else "gated"
            detail = "Checkout capped at ${}; substitutions and address changes remain approval-gated.".format(budget.group(1)) if budget else "Item list, maximum spend, substitutions, and delivery address require approval before checkout."
            decisions.append(GuardrailDecision("purchase", "Purchase scope", status, detail, [task.id for task in tasks if task.environment == "warehouse"]))
            decisions.append(GuardrailDecision("custody", "Two-party custody handoff", "passed", "Recipient work starts only after package ID, sender proof, safe door zone, and recipient acceptance match."))

        return decisions

    def _has_cycle(self, tasks: Sequence[PlannedTask]) -> bool:
        graph = {task.id: list(task.dependencies) for task in tasks}
        visiting: Set[str] = set()
        visited: Set[str] = set()

        def visit(node: str) -> bool:
            if node in visiting:
                return True
            if node in visited:
                return False
            visiting.add(node)
            for dependency in graph.get(node, []):
                if visit(dependency):
                    return True
            visiting.remove(node)
            visited.add(node)
            return False

        return any(visit(node) for node in graph)
