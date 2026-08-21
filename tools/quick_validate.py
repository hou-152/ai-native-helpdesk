#!/usr/bin/env python3
"""Validate the seven public Skill packs without third-party dependencies."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "release-files.v1.json"
SKILLS: Dict[str, Dict[str, Optional[str]]] = {
    "action": {"name": "aihd-action", "script": "scripts/next-step.mjs"},
    "ai-native-helpdesk": {"name": "ai-native-helpdesk", "script": None},
    "diagnosis": {"name": "aihd-diagnosis", "script": "scripts/classify-state.mjs"},
    "good-question": {"name": "aihd-good-question", "script": "scripts/clarify-gate.mjs"},
    "knowledge": {"name": "aihd-knowledge", "script": "scripts/bm25-search.mjs"},
    "safety": {"name": "aihd-safety", "script": "scripts/gate-decision.mjs"},
    "thinking": {"name": "aihd-thinking", "script": "scripts/analysis-state.mjs"},
}


class ValidationError(Exception):
    """A deterministic validation failure."""


def relative(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def parse_frontmatter(text: str, path: Path) -> Dict[str, str]:
    match = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)", text, re.DOTALL)
    if not match:
        raise ValidationError(f"{relative(path)}: missing YAML frontmatter")

    fields: Dict[str, str] = {}
    for line in match.group(1).splitlines():
        if line.startswith((" ", "\t")) or ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    return fields


def read_json_object(text: str, source: str) -> Dict[str, Any]:
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) != 1:
        raise ValidationError(f"{source}: expected exactly one JSON output line")
    try:
        value = json.loads(lines[0])
    except json.JSONDecodeError as error:
        raise ValidationError(f"{source}: invalid JSON output: {error}") from error
    if not isinstance(value, dict):
        raise ValidationError(f"{source}: JSON output must be an object")
    return value


def run_node(script: Path, *args: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["node", str(script), *args],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
    except FileNotFoundError as error:
        raise ValidationError("node is required but was not found on PATH") from error
    except subprocess.TimeoutExpired as error:
        raise ValidationError(f"{relative(script)}: execution exceeded 15 seconds") from error


def check_node_syntax(script: Path) -> None:
    try:
        checked = subprocess.run(
            ["node", "--check", str(script)],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
    except FileNotFoundError as error:
        raise ValidationError("node is required but was not found on PATH") from error
    except subprocess.TimeoutExpired as error:
        raise ValidationError(f"{relative(script)}: node --check exceeded 15 seconds") from error
    if checked.returncode != 0:
        raise ValidationError(f"{relative(script)}: node --check failed: {checked.stderr.strip()}")


def validate_runtime(script: Path) -> None:
    if not script.is_file():
        raise ValidationError(f"{relative(script)}: runtime script is missing")
    source = script.read_text(encoding="utf-8")
    if not source.startswith("#!/usr/bin/env node\n"):
        raise ValidationError(f"{relative(script)}: missing portable Node.js shebang")

    check_node_syntax(script)

    missing_input = run_node(script)
    if missing_input.returncode != 64 or missing_input.stdout:
        raise ValidationError(
            f"{relative(script)}: missing input must exit 64 and write no stdout"
        )
    read_json_object(missing_input.stderr, f"{relative(script)} missing-input stderr")

    smoke = run_node(script, "--input", "{}")
    if smoke.returncode != 0 or smoke.stderr:
        raise ValidationError(
            f"{relative(script)}: empty-object smoke failed: "
            f"exit={smoke.returncode} stderr={smoke.stderr.strip()}"
        )
    result = read_json_object(smoke.stdout, f"{relative(script)} smoke stdout")
    for field in ("status", "validation_signal", "persistence_candidate"):
        if field not in result:
            raise ValidationError(f"{relative(script)}: smoke output missing {field}")


def validate_skill(
    directory: str,
    metadata: Dict[str, Optional[str]],
    manifest_files: set[str],
) -> None:
    skill_path = REPO_ROOT / "skills" / directory / "SKILL.md"
    if not skill_path.is_file():
        raise ValidationError(f"{relative(skill_path)}: SKILL.md is missing")

    text = skill_path.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(text, skill_path)
    if frontmatter.get("name") != metadata["name"]:
        raise ValidationError(
            f"{relative(skill_path)}: expected name {metadata['name']!r}, "
            f"got {frontmatter.get('name')!r}"
        )
    if not frontmatter.get("description"):
        raise ValidationError(f"{relative(skill_path)}: description is empty")
    if directory == "ai-native-helpdesk" and frontmatter.get("license") != "Apache-2.0":
        raise ValidationError(f"{relative(skill_path)}: main Skill license must be Apache-2.0")

    skill_relative = relative(skill_path)
    if skill_relative not in manifest_files:
        raise ValidationError(f"{skill_relative}: absent from release manifest")
    if "验证信号" not in text or "落库候选" not in text:
        raise ValidationError(f"{skill_relative}: validation or persistence contract is missing")

    script_relative = metadata["script"]
    if script_relative is None:
        for child in SKILLS.values():
            child_name = child["name"]
            if child_name != "ai-native-helpdesk" and child_name not in text:
                raise ValidationError(f"{skill_relative}: missing child reference {child_name}")
        return

    if "## 工具链" not in text:
        raise ValidationError(f"{skill_relative}: toolchain section is missing")
    script_path = skill_path.parent / script_relative
    runtime_relative = relative(script_path)
    if runtime_relative not in manifest_files:
        raise ValidationError(f"{runtime_relative}: absent from release manifest")
    if Path(script_relative).name not in text:
        raise ValidationError(f"{skill_relative}: runtime script is not documented")
    validate_runtime(script_path)


def main() -> int:
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        manifest_files = manifest.get("files")
        if not isinstance(manifest_files, list) or not all(
            isinstance(item, str) for item in manifest_files
        ):
            raise ValidationError("release-files.v1.json: files must be a string array")
        if manifest_files != sorted(manifest_files) or len(manifest_files) != len(set(manifest_files)):
            raise ValidationError("release-files.v1.json: files must be sorted and unique")

        passed = 0
        for directory, metadata in SKILLS.items():
            validate_skill(directory, metadata, set(manifest_files))
            passed += 1
            print(f"PASS {metadata['name']}")
        print(f"{passed}/{len(SKILLS)} PASS")
        return 0
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
