from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class ArtifactTypeDescriptor:
    artifact_type: str
    display_name: str
    preview_policy: str
    canonical_source: str
    embeddable: bool
    persist_preview_payload: bool
    supported_sources: tuple[str, ...]
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_ARTIFACT_TYPES: tuple[ArtifactTypeDescriptor, ...] = (
    ArtifactTypeDescriptor(
        artifact_type="web_url",
        display_name="Web URL",
        preview_policy="link_card",
        canonical_source="source_url",
        embeddable=False,
        persist_preview_payload=True,
        supported_sources=("bocha.search", "langalpha.external", "user_upload.index"),
        notes="Use source_url as canonical evidence. Inline iframe preview is best-effort only and must not replace the URL.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="json",
        display_name="Structured JSON",
        preview_policy="json_pre",
        canonical_source="preview_payload",
        embeddable=False,
        persist_preview_payload=True,
        supported_sources=("tool.result", "market.context.load", "langalpha.external"),
        notes="Use for structured tool payloads, model JSON blocks, and external workbench metadata.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="text",
        display_name="Text Extract",
        preview_policy="text_pre",
        canonical_source="preview_payload.content",
        embeddable=False,
        persist_preview_payload=True,
        supported_sources=("tool.result", "model.output", "runtime.log"),
        notes="Use for long text excerpts. Large bodies should be truncated in preview and stored by URI later.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="table",
        display_name="Table",
        preview_policy="table",
        canonical_source="preview_payload.rows",
        embeddable=False,
        persist_preview_payload=True,
        supported_sources=("market.data", "portfolio.analysis", "langalpha.external"),
        notes="Use for market data snapshots, factor rows, holdings, and tabular diagnostics.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="chart",
        display_name="Chart",
        preview_policy="chart_spec",
        canonical_source="preview_payload",
        embeddable=False,
        persist_preview_payload=True,
        supported_sources=("market.data", "portfolio.analysis"),
        notes="Use for product-owned chart specs. Do not persist arbitrary executable chart code.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="file",
        display_name="File",
        preview_policy="download_link",
        canonical_source="storage_uri",
        embeddable=False,
        persist_preview_payload=False,
        supported_sources=("user_upload", "subprocess_worker", "langalpha.external"),
        notes="Use storage_uri as canonical source. Object storage can replace local paths later.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="html_preview",
        display_name="HTML Preview",
        preview_policy="sanitized_summary",
        canonical_source="storage_uri",
        embeddable=False,
        persist_preview_payload=False,
        supported_sources=("langalpha.external", "report.renderer"),
        notes="HTML preview is disabled by default for safety. Render as source link or sanitized summary.",
    ),
    ArtifactTypeDescriptor(
        artifact_type="image",
        display_name="Image",
        preview_policy="image_link",
        canonical_source="storage_uri_or_source_url",
        embeddable=True,
        persist_preview_payload=False,
        supported_sources=("bocha.search", "report.renderer", "user_upload"),
        notes="Use only trusted URLs or storage URIs. Do not inline untrusted SVG/HTML.",
    ),
)


def get_agent_artifact_catalog() -> dict[str, Any]:
    descriptors = [item.to_dict() for item in _ARTIFACT_TYPES]
    return {
        "version": 1,
        "artifactTypes": descriptors,
        "total": len(descriptors),
        "policies": {
            "canonicalUrlPolicy": "For external evidence, source_url is the canonical source. Embedded previews are optional and best-effort.",
            "securityPolicy": "Do not use dangerous HTML injection. HTML artifacts default to sanitized summary or source link.",
            "persistencePolicy": "MySQL is the formal artifact persistence target; JSON/in-memory remain fallback for local MVP scenarios.",
            "externalWorkbenchPolicy": "LangAlpha and TradingAgents outputs must be mapped to AlphaTrace AgentArtifact descriptors before UI rendering.",
        },
    }


__all__ = ["ArtifactTypeDescriptor", "get_agent_artifact_catalog"]
