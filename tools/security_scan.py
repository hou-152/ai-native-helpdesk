#!/usr/bin/env python3
"""Fail-closed static security gate for the six bundled child runtimes.

This deterministic repository check complements, but does not impersonate, the
third-party skills.sh/Socket audit. A provider result is current only when its
audit metadata binds to a snapshot that contains these scripts.
"""

from __future__ import annotations

import hashlib
import json
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
ALLOWED_PROCESS_PROPERTIES = {"argv", "exitCode", "stderr", "stdout"}
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

AST_SCAN_SCRIPT = r"""
const fs = require("node:fs");
const acorn = require("internal/deps/acorn/acorn/dist/acorn");

const source = fs.readFileSync(0, "utf8");
const allowedImports = new Set(JSON.parse(process.argv[1]));
const allowedProcessProperties = new Set(JSON.parse(process.argv[2]));
const forbiddenCalls = new Map([
  ["exec", "process execution"],
  ["execFile", "process execution"],
  ["execSync", "process execution"],
  ["execFileSync", "process execution"],
  ["spawn", "process execution"],
  ["spawnSync", "process execution"],
  ["fork", "process execution"],
  ["eval", "dynamic code execution"],
  ["Function", "dynamic code execution"],
  ["fetch", "network client"],
  ["WebSocket", "network client"],
  ["EventSource", "network client"],
  ["writeFile", "file mutation"],
  ["writeFileSync", "file mutation"],
  ["appendFile", "file mutation"],
  ["appendFileSync", "file mutation"],
  ["rm", "file mutation"],
  ["rmSync", "file mutation"],
  ["unlink", "file mutation"],
  ["unlinkSync", "file mutation"],
  ["rename", "file mutation"],
  ["renameSync", "file mutation"],
  ["chmod", "file mutation"],
  ["chmodSync", "file mutation"],
  ["chown", "file mutation"],
  ["chownSync", "file mutation"],
  ["open", "file mutation"],
  ["openSync", "file mutation"],
]);

let ast;
try {
  ast = acorn.parse(source, {
    allowHashBang: true,
    ecmaVersion: "latest",
    locations: true,
    sourceType: "module",
  });
} catch (error) {
  console.error(`JavaScript parse failed: ${error.message}`);
  process.exit(2);
}

const findings = [];
const processAliases = new Set(["process"]);
const processImportBindings = new Set();

function walk(node, parent, visit) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (["end", "loc", "range", "start", "type"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, node, visit);
    } else if (value && typeof value === "object") {
      walk(value, node, visit);
    }
  }
}

function addFinding(node, label, detail = "") {
  findings.push({
    detail,
    label,
    line: node.loc?.start?.line ?? 1,
  });
}

function staticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function propertyName(member) {
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  return staticString(member.property);
}

function importedName(specifier) {
  if (specifier.type !== "ImportSpecifier") return null;
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
}

function isGlobalProcessMember(node) {
  return node?.type === "MemberExpression"
    && node.object?.type === "Identifier"
    && node.object.name === "globalThis"
    && propertyName(node) === "process";
}

function isProcessObject(node) {
  return (node?.type === "Identifier" && processAliases.has(node.name))
    || isGlobalProcessMember(node);
}

function checkModule(node, moduleName) {
  if (!allowedImports.has(moduleName)) {
    addFinding(node, "import not allowlisted", moduleName);
  }
}

walk(ast, null, (node) => {
  if (node.type === "ImportDeclaration") {
    const moduleName = node.source.value;
    checkModule(node.source, moduleName);
    if (moduleName !== "node:process") return;
    for (const specifier of node.specifiers) {
      if (
        specifier.type === "ImportDefaultSpecifier"
        || specifier.type === "ImportNamespaceSpecifier"
        || importedName(specifier) === "default"
      ) {
        processAliases.add(specifier.local.name);
        processImportBindings.add(specifier.local.start);
        continue;
      }
      const name = importedName(specifier);
      if (name && !allowedProcessProperties.has(name)) {
        addFinding(specifier, "forbidden process property", name);
      }
    }
  }
  if (
    (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration")
    && node.source
  ) {
    checkModule(node.source, node.source.value);
  }
});

walk(ast, null, (node, parent) => {
  if (node.type === "ImportExpression") {
    addFinding(node, "dynamic code execution");
    return;
  }

  if (node.type === "CallExpression" || node.type === "NewExpression") {
    let name = null;
    if (node.callee.type === "Identifier") name = node.callee.name;
    if (node.callee.type === "MemberExpression") name = propertyName(node.callee);
    const label = name ? forbiddenCalls.get(name) : null;
    if (label) addFinding(node, label, name);
  }

  if (node.type === "MemberExpression" && isProcessObject(node.object)) {
    const name = propertyName(node);
    if (!name || !allowedProcessProperties.has(name)) {
      addFinding(
        node,
        name === "env" ? "environment access" : "forbidden process property",
        name ?? "computed"
      );
    }
  }

  if (node.type === "Identifier" && processAliases.has(node.name)) {
    if (processImportBindings.has(node.start)) return;
    if (parent?.type === "MemberExpression" && parent.object === node) return;
    if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    addFinding(node, "indirect process access", node.name);
  }

  if (isGlobalProcessMember(node)) {
    if (parent?.type === "MemberExpression" && parent.object === node) return;
    addFinding(node, "indirect process access", "globalThis.process");
  }
});

console.log(JSON.stringify(findings));
"""


class ScanError(Exception):
    """A security gate failure."""


def scan_ast(relative_path: str, source: str) -> None:
    checked = subprocess.run(
        [
            "node",
            "--expose-internals",
            "-e",
            AST_SCAN_SCRIPT,
            json.dumps(sorted(ALLOWED_NODE_IMPORTS)),
            json.dumps(sorted(ALLOWED_PROCESS_PROPERTIES)),
        ],
        cwd=REPO_ROOT,
        input=source,
        text=True,
        capture_output=True,
        timeout=15,
        check=False,
    )
    if checked.returncode != 0:
        detail = checked.stderr.strip() or f"node exited {checked.returncode}"
        raise ScanError(f"{relative_path}: AST scan failed: {detail}")
    try:
        findings = json.loads(checked.stdout)
    except json.JSONDecodeError as error:
        raise ScanError(f"{relative_path}: AST scan returned invalid JSON") from error
    if findings:
        finding = findings[0]
        detail = f": {finding['detail']}" if finding["detail"] else ""
        raise ScanError(
            f"{relative_path}:{finding['line']}: {finding['label']}{detail}"
        )


def scan_source(relative_path: str, source: str) -> None:
    scan_ast(relative_path, source)
    for label, pattern in FORBIDDEN_PATTERNS.items():
        match = pattern.search(source)
        if match:
            line = source.count("\n", 0, match.start()) + 1
            raise ScanError(f"{relative_path}:{line}: forbidden {label}")


def validate_scanner_regressions() -> None:
    fixtures = {
        "multiline-import": (
            """import {
  writeFileSync as save
} from \"node:fs\";
save(\"output.txt\", \"unsafe\");
""",
            "import not allowlisted: node:fs",
        ),
        "comment-separated-import": (
            'import/**/{ writeFileSync as save }from"node:fs";\n'
            'save("output.txt", "unsafe");\n',
            "import not allowlisted: node:fs",
        ),
        "process-import-alias": (
            'import proc from "node:process";\n'
            'console.log(proc.env.SECRET);\n',
            "environment access: env",
        ),
        "process-computed-property": (
            'process["env"].SECRET;\n',
            "environment access: env",
        ),
        "process-computed-concatenation": (
            'process["e" + "nv"].SECRET;\n',
            "environment access: env",
        ),
        "process-object-alias": (
            "const proc = process;\nconsole.log(proc.argv);\n",
            "indirect process access: process",
        ),
    }
    for name, (source, expected) in fixtures.items():
        try:
            scan_source(f"regression/{name}.mjs", source)
        except ScanError as error:
            if expected not in str(error):
                raise ScanError(f"{name} regression failed unexpectedly: {error}") from error
            continue
        raise ScanError(f"{name} regression bypassed the security gate")


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
