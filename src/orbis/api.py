"""Dependency-free HTTP API and operator console for the Orbis prototype."""

import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from .engine import OrchestrationError, Orchestrator, create_demo_orchestrator


WEB_ROOT = Path(__file__).resolve().parents[2] / "web"


class OrbisHTTPServer(ThreadingHTTPServer):
    def __init__(self, address: tuple, runtime: Orchestrator) -> None:
        super().__init__(address, OrbisRequestHandler)
        self.runtime = runtime


class OrbisRequestHandler(BaseHTTPRequestHandler):
    server: OrbisHTTPServer

    def do_GET(self) -> None:  # noqa: N802 - stdlib callback name
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json(200, {"status": "ok", "service": "orbis", "version": "0.1.0"})
            return
        if path == "/api/state":
            self._json(200, self.server.runtime.snapshot())
            return
        if path.startswith("/api/workflows/"):
            workflow_id = path.rsplit("/", 1)[-1]
            try:
                self._json(200, self.server.runtime.workflow_snapshot(workflow_id))
            except OrchestrationError as exc:
                self._error(404, str(exc))
            return
        self._serve_static(path)

    def do_POST(self) -> None:  # noqa: N802 - stdlib callback name
        path = urlparse(self.path).path
        try:
            payload = self._read_json()
            if path == "/api/workflows":
                self._create_workflow(payload)
                return
            if path.endswith("/retry") and path.startswith("/api/workflows/"):
                workflow_id = path.split("/")[3]
                self.server.runtime.retry(workflow_id)
                self._json(202, {"workflow_id": workflow_id, "status": "retrying"})
                return
            if path.endswith("/start") and path.startswith("/api/workflows/"):
                workflow_id = path.split("/")[3]
                self.server.runtime.start(workflow_id)
                self._json(202, {"workflow_id": workflow_id, "status": "started"})
                return
            self._error(404, "Unknown endpoint")
        except OrchestrationError as exc:
            self._error(409, str(exc))
        except (ValueError, json.JSONDecodeError) as exc:
            self._error(400, str(exc))
        except Exception as exc:
            self._error(500, f"Internal error: {exc}")

    def _create_workflow(self, payload: Dict[str, Any]) -> None:
        workflow = self.server.runtime.create_warehouse_workflow(
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
            if not target:
                raise ValueError("fail_at must be packing, transport, or loading")
            self.server.runtime.inject_failure(*target)
        if payload.get("auto_start", True):
            self.server.runtime.start(workflow.id)
        self._json(201, self.server.runtime.workflow_snapshot(workflow.id))

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        if length > 1_000_000:
            raise ValueError("Request body is too large")
        raw = self.rfile.read(length)
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("JSON body must be an object")
        return value

    def _serve_static(self, path: str) -> None:
        assets = {
            "/": "index.html",
            "/index.html": "index.html",
            "/app.js": "app.js",
            "/styles.css": "styles.css",
        }
        filename = assets.get(path)
        if not filename:
            self._error(404, "Not found")
            return
        file_path = WEB_ROOT / filename
        if not file_path.is_file():
            self._error(404, "Console asset not found")
            return
        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": message})

    def log_message(self, format_string: str, *args: Any) -> None:
        if os.environ.get("ORBIS_HTTP_LOG") == "1":
            super().log_message(format_string, *args)


def main() -> None:
    host = os.environ.get("ORBIS_HOST", "127.0.0.1")
    port = int(os.environ.get("ORBIS_PORT", "8080"))
    runtime = create_demo_orchestrator()
    server = OrbisHTTPServer((host, port), runtime)
    print(f"Orbis operator console: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

