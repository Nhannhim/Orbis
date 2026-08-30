"""Additive, deterministic view contract; media never acts as execution evidence."""
from copy import deepcopy

PHASES = [
    ("preparation", "Home preparation + warehouse fulfillment", ["wh_reserve", "wh_produce", "wh_dry", "wh_cold", "wh_consolidate", "home_floors", "home_stage", "home_furniture", "home_lighting"]),
    ("delivery", "Inspection + delivery", ["wh_vision", "wh_pack", "wh_stage", "wh_load", "delivery_route", "delivery_transit"]),
    ("dinner", "Cooking + serving", ["home_receive", "home_cook", "home_plate", "home_serve", "home_dinner_lighting", "home_verify", "dinner_ready"]),
    ("cleanup", "Cleanup + restoration", ["cleanup_gate", "cleanup_surfaces", "cleanup_leftovers", "cleanup_furniture", "cleanup_floors", "cleanup_lighting", "cleanup_verify"]),
]

# Only audited, task-matching clips are mapped. Missing scenes stay unavailable.
CLIPS = {"home_floors": "home-cleanliness", "home_furniture": "home-layout", "home_lighting": "home-lights", "home_dinner_lighting": "home-lights", "cleanup_floors": "home-cleanliness", "cleanup_lighting": "home-lights"}
STILLS = {"home_cook": "humanoid-cooking", "dinner_ready": "dinner-ready", "home_verify": "dinner-ready", "cleanup_verify": "home-restored"}


def presentation(tasks, routing, checkpoint_time):
    lookup = {t["id"]: t for t in tasks}
    groups = []
    for group_id, title, ids in PHASES:
        members = [lookup[i] for i in ids if i in lookup]
        statuses = {t["status"] for t in members}
        status = "completed" if statuses == {"completed"} else "attention_required" if statuses & {"attention_required", "failed"} else "executing" if statuses & {"executing", "verifying", "reserved"} else "queued"
        groups.append({"id": group_id, "title": title, "task_ids": ids, "status": status,
                       "completed_count": sum(t["status"] == "completed" for t in members), "task_count": len(members)})
    media = {}
    for task in tasks:
        tid = task["id"]
        timestamp = task.get("completed_at") or checkpoint_time
        base = {"id": f"media:{tid}:v1", "task_id": tid, "checkpoint_time": timestamp,
                "disclaimer": "Illustrative simulation media; not independent physical or food-safety verification."}
        if tid in CLIPS:
            clip = CLIPS[tid]
            base.update({"kind": "simulated_video_frame", "image_url": f"/images/home-evidence/{clip}.jpg",
                         "video_url": f"/videos/{clip}.mp4", "source_clip": f"{clip}.mp4", "offset_seconds": 2})
        elif tid in STILLS:
            base.update({"kind": "synthetic_illustration", "image_url": f"/images/home-evidence/{STILLS[tid]}.png"})
        else:
            base.update({"kind": "unavailable", "reason": "No task-matched camera media is available for this demo assignment."})
        media[tid] = base
    return {"phase_groups": groups,
            "relationships": [{"from": dep, "to": t["id"], "kind": "dependency"} for t in tasks for dep in t["dependencies"]],
            "decisions": [
                {"id": "package_review", "task_id": "wh_vision", "branches": ["Clear → physical packing", "Review required → Human Inspector → re-evaluate"], "status": lookup.get("wh_vision", {}).get("status", "queued")},
                {"id": "delivery_eligibility", "task_id": "delivery_route", "candidates": deepcopy(routing.get("candidates", [])), "status": routing.get("status", "pending")},
                {"id": "host_cleanup", "task_id": "cleanup_gate", "branches": ["Dinner is over → cleanup", "Not yet → keep waiting"], "status": lookup.get("cleanup_gate", {}).get("status", "queued")},
            ], "media": media,
            "milestone_images": {key: media[tid] for key, tid in [("dinner_ready", "dinner_ready"), ("home_restored", "cleanup_verify")] if lookup.get(tid, {}).get("status") == "completed"}}
