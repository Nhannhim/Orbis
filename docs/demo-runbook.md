# Orbis Demo Runbook

## Before the demo

From the repository root, install the backend and frontend once:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
cd site && npm install && cd ..
```

For a predictable rehearsal, run explicit fixture mode:

```bash
ORBIS_VISION_MODE=fixture ./scripts/run-demo
```

Open [http://localhost:3000/app/demo](http://localhost:3000/app/demo). The UI must say **FIXTURE**. The API reference is at [http://127.0.0.1:8080/api/docs](http://127.0.0.1:8080/api/docs). Stop both services with Control-C.

## Hero story: dinner for twelve

1. Select **Home** on New Task and keep the proposed vegetarian pasta objective.
2. Select **Create plan**. Review the menu, grocery estimate, workers, parallel schedule, and hard approval gate.
3. Select **Approve order & start**. Keep the center Home camera grid and right **Workflow** rail visible together. Point out that Warehouse and Home preparation start independently.
4. Watch active Home feeds highlight together while the right rail names each branch's current task, progress, dependency, and join point. Select a rail node to inspect that task in the session.
5. Show the specialized produce, dry-goods, and cold-storage pickers feeding the existing Vision, packing, AMR, and loading workflow.
6. Show **SIMULATED ROUTING**. The small robot is rejected for volume and refrigeration; the large delivery worker is selected with explicit reasons.
7. Follow the delivery join: Loader Robot accepts and reconciles grocery custody, then Humanoid Cook receives the ingredients.
8. End preparation on **Dinner Ready**, including the readiness checklist and accumulated custody/evidence history.
9. Select **Dinner is over — start cleanup**. Follow Loader, Humanoid Cook, Furniture Robot, Roomba, and Lamp Agent through restoration.
10. End on **Completed**, where every required cleanup check has proof and the outcome progress is 100%.

The dinner-ready phase takes about 20–25 seconds and cleanup takes about 8 seconds, leaving enough time to narrate parallel work and handoffs. Videos must remain labeled **SIMULATED FEED** and never advance task state.

## Supporting Vision story: damaged package

1. Select **Damaged package**.
2. Click **Run demo**.
3. Point out Package Vision 01, the simulated feed, original damage observation, and model confidence.
4. Show `Review required`. Emphasize that packing and both next-mile candidates are blocked.
5. In Human Inspector, select **Repackaged & clear**. The demo appends its prefilled remediation note.
6. Show the immutable original observation beside the appended human remediation.
7. Show **SIMULATED ROUTING**: Delivery Van 07 is recommended, while Delivery Robot 01 remains visible with its rejection reason.
8. Follow the packing arm, AMR, and loading station through their evidence-backed custody handoffs.
9. End on the activity/evidence history and final completed state.

Target: 75–90 seconds.

## Supporting stories

- **Normal package:** clears without review and recommends Delivery Robot 01.
- **Uncertain package:** highlights low-confidence fields and remains blocked until corrected.
- **Provider failure:** use the hidden fixture through the API or a test control if present. Confirm no physical step starts and only Vision retry is offered.

Refresh during any story to demonstrate that the UI reconstructs from backend state rather than advancing with browser timers.

## Live OpenAI mode

Copy `.env.example` to `.env.local`, set only your server-side `OPENAI_API_KEY`, and keep the file uncommitted. Then run:

```bash
ORBIS_VISION_MODE=openai ./scripts/run-demo
```

The UI must say **LIVE MODEL**. Live mode analyzes the allowlisted scenario image. It never exposes the key to the browser and never silently changes to fixture mode. If the provider fails, use Retry to repeat Vision. For a demo fallback, stop the launcher and restart explicitly in fixture mode.

## Expected safety checks

- A damaged, uncertain, or unavailable inspection leaves physical steps pending.
- Vision and Human Inspector never appear in physical custody events.
- Review creates a new evidence record; it does not change the original prediction.
- Both selected and rejected routing workers retain a reason.
- Fixture/live labeling matches `/api/v1/system`.

## Troubleshooting

- **Backend offline:** confirm port 8080 is free, then restart the launcher.
- **Frontend offline:** confirm port 3000 is free and `site/node_modules` exists.
- **OpenAI unavailable:** do not pretend the result is live. Rehearse with explicit fixture mode.
- **UI looks stale:** refresh; the latest workflow is reconstructed by polling the backend.
- **Secret warning:** never paste a key into the UI, terminal output, issue, commit, fixture, or screenshot.
