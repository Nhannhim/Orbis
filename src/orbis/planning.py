"""Deterministic dinner planning and warehouse-order fixtures.

The MVP keeps planning predictable for demos while exposing a provider-shaped
interface that can later be backed by a structured model response.  All safety,
approval, and execution policy remains application owned.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import re
from typing import Any, Dict, List, Mapping, Protocol


class PlanningError(ValueError):
    """A stable error raised when a dinner request cannot form a safe plan."""


class DinnerPlanner(Protocol):
    mode: str

    def plan(self, objective: str, parameters: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        """Return a structured, unapproved dinner plan."""


@dataclass(frozen=True)
class InventoryItem:
    sku: str
    name: str
    category: str
    unit_price: float
    refrigerated: bool = False


INVENTORY: Dict[str, InventoryItem] = {
    "pasta": InventoryItem("DRY-PASTA-01", "Rigatoni pasta", "dry_goods", 3.80),
    "tomato": InventoryItem("PRO-TOMATO-01", "Roma tomatoes", "produce", 1.10),
    "basil": InventoryItem("PRO-BASIL-01", "Fresh basil", "produce", 3.25),
    "garlic": InventoryItem("PRO-GARLIC-01", "Garlic", "produce", 0.85),
    "onion": InventoryItem("PRO-ONION-01", "Yellow onion", "produce", 0.95),
    "parmesan": InventoryItem("CLD-PARM-01", "Vegetarian parmesan", "cold_storage", 7.90, True),
    "lettuce": InventoryItem("PRO-LETTUCE-01", "Green leaf lettuce", "produce", 2.75),
    "cucumber": InventoryItem("PRO-CUCUMBER-01", "Cucumber", "produce", 1.25),
    "dressing": InventoryItem("CLD-DRESS-01", "Italian dressing", "cold_storage", 4.65, True),
    "bread": InventoryItem("DRY-BREAD-01", "Garlic bread loaf", "dry_goods", 4.50),
    "oil": InventoryItem("DRY-OIL-01", "Olive oil", "dry_goods", 8.40),
}


def _guest_count(objective: str, parameters: Mapping[str, Any]) -> int:
    explicit = parameters.get("guest_count") or parameters.get("guests")
    if explicit is not None:
        try:
            count = int(explicit)
        except (TypeError, ValueError) as exc:
            raise PlanningError("guest_count must be a whole number") from exc
    else:
        match = re.search(r"(?:for|serves?)\s+(\d{1,3})", objective, re.IGNORECASE)
        count = int(match.group(1)) if match else 12
    if count < 1 or count > 40:
        raise PlanningError("The demo supports between 1 and 40 guests")
    return count


def _ready_time(objective: str, parameters: Mapping[str, Any]) -> str:
    explicit = str(parameters.get("ready_time") or "").strip()
    if explicit:
        return explicit
    match = re.search(r"(?:by|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", objective, re.IGNORECASE)
    if not match:
        return "7:00 PM"
    hour = int(match.group(1))
    minute = match.group(2) or "00"
    meridiem = (match.group(3) or ("PM" if hour <= 11 else "")).upper()
    if hour > 12 and not meridiem:
        hour -= 12
        meridiem = "PM"
    return f"{hour}:{minute}{f' {meridiem}' if meridiem else ''}"


def _line(item_key: str, quantity: float, unit: str) -> Dict[str, Any]:
    item = INVENTORY[item_key]
    return {
        "sku": item.sku,
        "name": item.name,
        "category": item.category,
        "quantity": quantity,
        "unit": unit,
        "unit_price": item.unit_price,
        "estimated_price": round(item.unit_price * quantity, 2),
        "refrigerated": item.refrigerated,
        "status": "available",
        "substitutions": [],
    }


class FixtureDinnerPlanner:
    """Create the curated pasta-dinner plan used by the end-to-end demo."""

    mode = "fixture"
    version = "dinner-plan-v1"

    def plan(self, objective: str, parameters: Mapping[str, Any] | None = None) -> Dict[str, Any]:
        objective = objective.strip()
        if not objective:
            raise PlanningError("objective is required")
        values = dict(parameters or {})
        guests = _guest_count(objective, values)
        ready_time = _ready_time(objective, values)
        vegetarian = "vegetarian" in objective.lower() or bool(values.get("vegetarian", True))
        dietary = list(values.get("dietary_restrictions") or [])
        if vegetarian and "vegetarian" not in {str(item).lower() for item in dietary}:
            dietary.insert(0, "vegetarian")

        scale = max(1.0, guests / 12)
        order: List[Dict[str, Any]] = [
            _line("pasta", round(6 * scale), "packages"),
            _line("tomato", round(12 * scale), "items"),
            _line("basil", round(3 * scale), "bunches"),
            _line("garlic", round(3 * scale), "heads"),
            _line("onion", round(3 * scale), "items"),
            _line("parmesan", round(2 * scale), "packages"),
            _line("lettuce", round(3 * scale), "heads"),
            _line("cucumber", round(3 * scale), "items"),
            _line("dressing", round(2 * scale), "bottles"),
            _line("bread", round(3 * scale), "loaves"),
            _line("oil", 1, "bottle"),
        ]
        total = round(sum(float(item["estimated_price"]) for item in order), 2)
        item_units = int(sum(float(item["quantity"]) for item in order))

        plan = {
            "planner": {"mode": self.mode, "version": self.version},
            "title": f"Pasta dinner for {guests}",
            "objective": objective,
            "scenario_type": "home_dinner",
            "guest_count": guests,
            "ready_time": ready_time,
            "menu": [
                {"name": "Vegetarian pasta", "servings": guests},
                {"name": "Green salad", "servings": guests},
                {"name": "Garlic bread", "servings": guests},
            ],
            "dietary_policies": dietary,
            "order": {
                "currency": "USD",
                "estimated_total": total,
                "line_items": order,
                "item_units": item_units,
                "requires_refrigeration": any(bool(item["refrigerated"]) for item in order),
                "estimated_weight_kg": round(14.5 * scale, 1),
                "estimated_volume_l": round(52 * scale, 1),
                "status": "proposed",
            },
            "workers": [
                "produce-picker-01",
                "dry-goods-picker-01",
                "cold-storage-picker-01",
                "packing-arm-01",
                "package-vision-01",
                "delivery-robot-01",
                "delivery-van-07",
                "roomba-01",
                "home-humanoid-cook-01",
                "home-loader-01",
                "home-furniture-01",
                "home-lamp-agent-01",
            ],
            "schedule": [
                {"id": "parallel_start", "label": "Warehouse and Home preparation begin", "time": "4:30 PM"},
                {"id": "delivery", "label": "Grocery delivery expected", "time": "5:50 PM"},
                {"id": "cooking", "label": "Ingredient-dependent cooking begins", "time": "6:00 PM"},
                {"id": "ready", "label": "Dinner ready and verified", "time": "6:45 PM"},
            ],
            "policies": {
                "purchase_requires_approval": True,
                "substitutions": "ask_first",
                "high_risk_cooking": "human_approval",
                "cleanup": "host_triggered",
                "furniture_requires_clear_zone": True,
                "delivery_requires_package_clearance": True,
            },
            "definition_of_done": [
                "meal_prepared",
                "table_ready_for_guests",
                "dining_area_clean",
                "dinner_lighting_active",
                "dietary_policy_satisfied",
                "delivery_manifest_reconciled",
            ],
        }
        validate_plan(plan)
        return deepcopy(plan)


def validate_plan(plan: Mapping[str, Any]) -> None:
    """Validate the application-owned invariants for a proposed plan."""

    if plan.get("scenario_type") != "home_dinner":
        raise PlanningError("Unsupported scenario_type")
    if int(plan.get("guest_count") or 0) < 1:
        raise PlanningError("A dinner plan requires at least one guest")
    order = plan.get("order") or {}
    if not isinstance(order, Mapping) or not order.get("line_items"):
        raise PlanningError("A dinner plan requires a warehouse order")
    policies = plan.get("policies") or {}
    if policies.get("purchase_requires_approval") is not True:
        raise PlanningError("Purchase approval cannot be disabled")
    if policies.get("cleanup") != "host_triggered":
        raise PlanningError("The MVP requires host-triggered cleanup")
