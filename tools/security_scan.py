#!/usr/bin/env python3
"""Fail-closed static security gate for the six bundled child runtimes.

This deterministic repository check complements, but does not impersonate, the
third-party skills.sh/Socket audit. A provider result is current only when its
audit metadata binds to a snapshot that contains these scripts.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Pattern


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = (
    "skills/action/scripts/next-step.mjs",
    "skills/diagnosis/scripts/classify-state.mjs",
    "skills/good-question/scripts/clarify-gate.mjs",
    "skills/knowledge/scripts/bm25-search.mjs",
    "skills/safety/scripts/gate-decision.mjs",
    "skills/thinking/scripts/analysis-state.mjs",
)
ALLOWED_NODE_IMPORTS = {"node:path", "node:process", "node:url"}
FORBIDDEN_PATTERNS: Dict[str, Pattern[str]] = {
    "network module": re.compile(r"node:(?:net|tls|dgram|http|https|http2|dns)\b"),
    "process execution": re.compile(
        r"\b(?:exec|execFile|execSync|execFileSync|spawn|spawnSync|fork)\s*\("
    ),
    "dynamic code execution": re.compile(r"\b(?:eval|Function)\s*\(|\bimport\s*\("),
    "network client": re.compile(r"\b(?:fetch|WebSocket|EventSource)\s*\("),
    "environment access": re.compile(r"\bprocess\.env\b"),
    "file mutation": re.compile(
        r"\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|"
        r"unlinkSync|rename|renameSync|chmod|chmodSync|chown|chownSync|open|openSync)\s*\("
    ),
    "sensitive runtime module": re.compile(
        r"node:(?:child_process|cluster|inspector|vm|worker_threads)\b"
    ),
}
IMPORT_PATTERN = re.compile(
    r"^\s*import\s+(?:(?:[\s\S]*?)\s+from\s+)?[\"']([^\"']+)[\"']",
    re.MULTILINE,
)


class ScanError(Exception):
    """A security gate failure."""


def scan_source(relative_path: str, source: str) -> None:
    for module in IMPORT_PATTERN.findall(source):
        if module not in ALLOWED_NODE_IMPORTS:
            raise ScanError(f"{relative_path}: import not allowlisted: {module}")
    for label, pattern in FORBIDDEN_PATTERNS.items():
        match = pattern.search(source)
        if match:
            line = source.count("\n", 0, match.start()) + 1
            raise ScanError(f"{relative_path}:{line}: forbidden {label}")


def validate_scanner_regressions() -> None:
    multiline_import_bypass = """import {
  writeFileSync as save
} from \"node:fs\";
save(\"output.txt\", \"unsafe\");
"""
    try:
        scan_source("regression/multiline-import.mjs", multiline_import_bypass)
    except ScanError as error:
        if "import not allowlisted: node:fs" not in str(error):
            raise ScanError(f"multiline import regression failed unexpectedly: {error}") from error
    else:
        raise ScanError("multiline import regression bypassed the import allowlist")


def scan_script(relative_path: str) -> str:
    path = REPO_ROOT / relative_path
    if not path.is_file():
        raise ScanError(f"{relative_path}: missing")
    source = path.read_text(encoding="utf-8")
    scan_source(relative_path, source)

    checked = subprocess.run(
        ["node", "--check", str(path)],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    if checked.returncode != 0:
        raise ScanError(f"{relative_path}: node --check failed: {checked.stderr.strip()}")

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return f"PASS {relative_path} sha256={digest}"


def main() -> int:
    results: List[str] = []
    try:
        validate_scanner_regressions()
        for relative_path in SCRIPTS:
            results.append(scan_script(relative_path))
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired, ScanError) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1

    for result in results:
        print(result)
    print(f"{len(results)}/{len(SCRIPTS)} PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
