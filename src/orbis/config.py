"""Runtime configuration for the local Orbis demo services."""

from dataclasses import dataclass
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def load_local_environment() -> None:
    """Load the ignored local env file without overriding process settings."""

    load_dotenv(REPOSITORY_ROOT / ".env.local", override=False)


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    allowed_origins: List[str]
    vision_mode: str
    vision_model: str
    vision_timeout_seconds: float
    key_configured: bool

    @classmethod
    def from_environment(cls) -> "Settings":
        load_local_environment()
        mode = os.environ.get("ORBIS_VISION_MODE", "openai").strip().lower()
        if mode not in {"openai", "fixture"}:
            raise ValueError("ORBIS_VISION_MODE must be 'openai' or 'fixture'")
        origins = [
            value.strip()
            for value in os.environ.get(
                "ORBIS_ALLOWED_ORIGIN", "http://localhost:3000"
            ).split(",")
            if value.strip()
        ]
        return cls(
            host=os.environ.get("ORBIS_HOST", "127.0.0.1"),
            port=int(os.environ.get("ORBIS_PORT", "8080")),
            allowed_origins=origins,
            vision_mode=mode,
            vision_model=os.environ.get("ORBIS_VISION_MODEL", "gpt-5.4-mini"),
            vision_timeout_seconds=float(
                os.environ.get("ORBIS_VISION_TIMEOUT_SECONDS", "15")
            ),
            key_configured=bool(os.environ.get("OPENAI_API_KEY", "").strip()),
        )
