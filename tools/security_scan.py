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
EXPECTED_SCRIPT_SHA256 = {
    "skills/action/scripts/next-step.mjs": (
        "a1911a937273e5bfe43aadd74e60e61537352456c596690ff16168380980435e"
    ),
    "skills/diagnosis/scripts/classify-state.mjs": (
        "17f7a6b0f761f86623bcd470b9f2b9a31c0ea0ac0e90e52caa6030b34ade782f"
    ),
    "skills/good-question/scripts/clarify-gate.mjs": (
        "ea20375410a2eb3acdd6ecd75a3ccc2326fed6e936b216ad55a9501eac3668d1"
    ),
    "skills/knowledge/scripts/bm25-search.mjs": (
        "f8c3f9f3f1c538fb0a2835db1fe8f15651638bd0e3c4de48d0404d9afa319e2c"
    ),
    "skills/safety/scripts/gate-decision.mjs": (
        "efae08f768337229e069220c37b13fd5bf9cb2179735bdb3694f2978b640692f"
    ),
    "skills/thinking/scripts/analysis-state.mjs": (
        "d3717deece23b6bc21189ecc9b6e162809a17d1c1db709e3204c386b0e2f295d"
    ),
}
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
const forbiddenStaticStrings = new Set(["constructor"]);
const forbiddenRuntimeObjects = new Map([
  ["Reflect", "reflective property access"],
]);
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
  ["defineProperties", "reflective property access"],
  ["defineProperty", "reflective property access"],
  ["getOwnPropertyDescriptor", "reflective property access"],
  ["getOwnPropertyDescriptors", "reflective property access"],
  ["getPrototypeOf", "reflective property access"],
  ["setPrototypeOf", "reflective property access"],
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
const constantInitializers = new Map();
const computedValueAliases = new Set();
const computedMemberPaths = new Set();
const bindingCounts = new Map();

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

function bindingNames(pattern, names = []) {
  if (!pattern) return names;
  if (pattern.type === "Identifier") {
    names.push(pattern.name);
    return names;
  }
  if (pattern.type === "AssignmentPattern") {
    return bindingNames(pattern.left, names);
  }
  if (pattern.type === "RestElement") {
    return bindingNames(pattern.argument, names);
  }
  if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) bindingNames(element, names);
    return names;
  }
  if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) {
      bindingNames(
        property.type === "RestElement" ? property.argument : property.value,
        names
      );
    }
  }
  return names;
}

function noteBindings(pattern) {
  for (const name of bindingNames(pattern)) {
    bindingCounts.set(name, (bindingCounts.get(name) ?? 0) + 1);
  }
}

walk(ast, null, (node) => {
  if (node.type === "VariableDeclarator") noteBindings(node.id);
  if (
    node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
    || node.type === "ArrowFunctionExpression"
  ) {
    if (node.id) noteBindings(node.id);
    for (const parameter of node.params) noteBindings(parameter);
  }
  if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
    if (node.id) noteBindings(node.id);
  }
  if (node.type === "ImportDeclaration") {
    for (const specifier of node.specifiers) noteBindings(specifier.local);
  }
  if (node.type === "CatchClause") noteBindings(node.param);
});

walk(ast, null, (node) => {
  if (node.type !== "VariableDeclaration" || node.kind !== "const") return;
  for (const declaration of node.declarations) {
    if (declaration.id.type !== "Identifier" || !declaration.init) continue;
    const name = declaration.id.name;
    if (constantInitializers.has(name)) {
      constantInitializers.set(name, null);
      continue;
    }
    constantInitializers.set(name, declaration.init);
  }
});

function staticString(node, resolving = new Set()) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  if (node.type === "Identifier" && constantInitializers.has(node.name)) {
    const initializer = constantInitializers.get(node.name);
    if (!initializer || resolving.has(node.name)) return null;
    const nextResolving = new Set(resolving);
    nextResolving.add(node.name);
    return staticString(initializer, nextResolving);
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = staticString(node.left, resolving);
    const right = staticString(node.right, resolving);
    return left === null || right === null ? null : left + right;
  }
  if (
    node.type === "CallExpression"
    && node.callee.type === "MemberExpression"
    && propertyName(node.callee) === "join"
    && node.callee.object.type === "ArrayExpression"
    && node.arguments.length <= 1
  ) {
    const separator = node.arguments.length === 0
      ? ","
      : staticString(node.arguments[0], resolving);
    if (separator === null) return null;
    const parts = [];
    for (const element of node.callee.object.elements) {
      if (!element) {
        parts.push("");
        continue;
      }
      if (element.type === "SpreadElement") return null;
      const part = staticString(element, resolving);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join(separator);
  }
  return null;
}

function propertyName(member) {
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  return staticString(member.property);
}

function isFreshConstructorCapable(node) {
  return [
    "ArrayExpression",
    "ArrowFunctionExpression",
    "CallExpression",
    "ClassExpression",
    "FunctionExpression",
    "Literal",
    "NewExpression",
    "ObjectExpression",
    "TemplateLiteral",
  ].includes(node?.type) && !(node.type === "Literal" && node.value === null);
}

function memberPath(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type !== "MemberExpression") return null;
  const objectPath = memberPath(node.object);
  const name = propertyName(node);
  return objectPath && name !== null ? `${objectPath}.${name}` : null;
}

function containsComputedValue(node) {
  let found = false;
  walk(node, null, (candidate) => {
    if (
      candidate.type === "Identifier"
      && computedValueAliases.has(candidate.name)
    ) {
      found = true;
    }
    if (
      candidate.type === "MemberExpression"
      && computedMemberPaths.has(memberPath(candidate))
    ) {
      found = true;
    }
    if (
      candidate.type === "MemberExpression"
      && candidate.computed
      && propertyName(candidate) === null
    ) {
      found = true;
    }
  });
  return found;
}

let computedValuesChanged = true;
while (computedValuesChanged) {
  computedValuesChanged = false;
  walk(ast, null, (node) => {
    let names = [];
    let value = null;
    if (node.type === "VariableDeclarator") {
      names = bindingNames(node.id);
      value = node.init;
    }
    if (node.type === "AssignmentPattern") {
      names = bindingNames(node.left);
      value = node.right;
    }
    if (
      node.type === "AssignmentExpression"
      && node.operator === "="
    ) {
      names = bindingNames(node.left);
      value = node.right;
    }
    if (!value || !containsComputedValue(value)) return;
    for (const name of names) {
      if (
        bindingCounts.get(name) === 1
        && !computedValueAliases.has(name)
      ) {
        computedValueAliases.add(name);
        computedValuesChanged = true;
      }
    }
    if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression") {
      const path = memberPath(node.left);
      if (path && !computedMemberPaths.has(path)) {
        computedMemberPaths.add(path);
        computedValuesChanged = true;
      }
    }
  });
}

function importedName(specifier) {
  if (specifier.type !== "ImportSpecifier") return null;
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
}

function reexportedName(specifier) {
  if (specifier.type !== "ExportSpecifier") return null;
  if (specifier.local.type === "Identifier") return specifier.local.name;
  return specifier.local.value;
}

function isGlobalObject(node) {
  if (node?.type === "Identifier") {
    return ["global", "globalThis"].includes(node.name);
  }
  return node?.type === "MemberExpression"
    && isGlobalObject(node.object)
    && ["global", "globalThis"].includes(propertyName(node));
}

function isGlobalProcessMember(node) {
  return node?.type === "MemberExpression"
    && isGlobalObject(node.object)
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
    const moduleName = node.source.value;
    checkModule(node.source, moduleName);
    if (moduleName !== "node:process") return;
    if (node.type === "ExportAllDeclaration") {
      addFinding(node, "indirect process access", "node:process re-export");
      return;
    }
    for (const specifier of node.specifiers) {
      const name = reexportedName(specifier);
      if (name === "default") {
        addFinding(specifier, "indirect process access", "default re-export");
      } else if (!name || !allowedProcessProperties.has(name)) {
        addFinding(specifier, "forbidden process property", name ?? "computed");
      }
    }
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
    if (containsComputedValue(node.callee)) {
      addFinding(node, "computed call target");
    }
  }

  if (node.type === "MemberExpression") {
    const name = propertyName(node);
    const isDirectCallee = (
      parent?.type === "CallExpression" || parent?.type === "NewExpression"
    ) && parent.callee === node;
    if (name && forbiddenCalls.has(name) && !isDirectCallee) {
      addFinding(node, "indirect forbidden call target", name);
    }
    if (name && forbiddenStaticStrings.has(name)) {
      addFinding(node, "dynamic code execution", name);
    }
    if (
      node.computed
      && name === null
      && node.object.type === "MemberExpression"
      && node.object.computed
      && propertyName(node.object) === null
    ) {
      addFinding(node, "computed member chain");
    }
    if (node.computed && name === null && isFreshConstructorCapable(node.object)) {
      addFinding(node, "computed constructor-capable access");
    }
    if (isGlobalObject(node.object) && !name) {
      addFinding(node, "computed global access");
    }
  }

  if (
    [
      "BinaryExpression",
      "CallExpression",
      "Identifier",
      "Literal",
      "TemplateLiteral",
    ].includes(node.type)
    && forbiddenStaticStrings.has(staticString(node))
  ) {
    addFinding(node, "dynamic code execution", staticString(node));
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

  if (node.type === "Identifier" && forbiddenCalls.has(node.name)) {
    const isPropertyName = (
      parent?.type === "MemberExpression"
      && parent.property === node
      && !parent.computed
    );
    const isObjectKey = (
      parent?.type === "Property"
      && parent.key === node
      && !parent.computed
      && !parent.shorthand
    );
    const isDirectCallee = (
      parent?.type === "CallExpression" || parent?.type === "NewExpression"
    ) && parent.callee === node;
    if (!isPropertyName && !isObjectKey && !isDirectCallee) {
      addFinding(node, "indirect forbidden call target", node.name);
    }
  }

  if (node.type === "Identifier" && forbiddenRuntimeObjects.has(node.name)) {
    const isPropertyName = (
      parent?.type === "MemberExpression"
      && parent.property === node
      && !parent.computed
    );
    const isObjectKey = (
      parent?.type === "Property"
      && parent.key === node
      && !parent.computed
      && !parent.shorthand
    );
    if (!isPropertyName && !isObjectKey) {
      addFinding(node, forbiddenRuntimeObjects.get(node.name), node.name);
    }
  }

  if (isGlobalProcessMember(node)) {
    if (parent?.type === "MemberExpression" && parent.object === node) return;
    addFinding(node, "indirect process access", "global process");
  }

  if (isGlobalObject(node)) {
    if (parent?.type === "MemberExpression" && parent.object === node) return;
    const name = node.type === "MemberExpression" ? propertyName(node) : node.name;
    addFinding(node, "indirect global access", name);
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


def scan_source(
    relative_path: str,
    source: str,
    *,
    enforce_approved_bytes: bool = True,
) -> None:
    if enforce_approved_bytes:
        validate_script_digest(relative_path, source.encode("utf-8"))
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
        "forbidden-call-alias": (
            'const request = fetch;\nawait request("https://example.com");\n',
            "indirect forbidden call target: fetch",
        ),
        "forbidden-call-sequence": (
            'await (0, fetch)("https://example.com");\n',
            "indirect forbidden call target: fetch",
        ),
        "global-process-computed-property": (
            'global.process["env"].SECRET;\n',
            "environment access: env",
        ),
        "global-computed-process-property": (
            'global["pro" + "cess"]["e" + "nv"].SECRET;\n',
            "environment access: env",
        ),
        "forbidden-call-destructuring": (
            "const { fetch: request } = globalThis;\n"
            'await request("https://example.com");\n',
            "indirect global access: globalThis",
        ),
        "dynamic-global-property": (
            'const name = "fetch";\nawait globalThis[name]("https://example.com");\n',
            "network client: fetch",
        ),
        "constructor-chain": (
            '({}).constructor.constructor("return process[\'e\' + \'nv\'].SECRET")();\n',
            "dynamic code execution: constructor",
        ),
        "computed-constructor-chain": (
            'const key = "con" + "structor";\n({})[key][key]("return 1")();\n',
            "dynamic code execution: constructor",
        ),
        "joined-constructor-chain": (
            'const key = ["con", "structor"].join("");\n'
            '({})[key][key]("return process[\'e\' + \'nv\'].SECRET")();\n',
            "dynamic code execution: constructor",
        ),
        "runtime-computed-constructor-chain": (
            'let key = getKey();\n'
            '({})[key][key]("return 1")();\n',
            "computed call target",
        ),
        "aliased-computed-constructor-chain": (
            'let key = getKey();\n'
            'const objectConstructor = ({})[key];\n'
            'const functionConstructor = objectConstructor[key];\n'
            'functionConstructor("return process[\'e\' + \'nv\'].SECRET")();\n',
            "computed constructor-capable access",
        ),
        "destructured-computed-constructor-chain": (
            'let key = process.argv[2];\n'
            'const [run] = [({})[key][key]];\n'
            'run("return process[\'e\' + \'nv\'].SECRET")();\n',
            "computed member chain",
        ),
        "split-destructured-constructor-chain": (
            'let key = getKey();\n'
            'const [objectConstructor] = [({})[key]];\n'
            'const { run } = { run: objectConstructor[key] };\n'
            'run("return 1")();\n',
            "computed constructor-capable access",
        ),
        "defaulted-destructured-constructor-chain": (
            'let key = process.argv[2];\n'
            'const [first = ({})[key]] = [];\n'
            'const [run = first[key]] = [];\n'
            'run("return process[\'e\' + \'nv\'].HOME")();\n',
            "computed constructor-capable access",
        ),
        "shadowed-computed-constructor-chain": (
            'let key = process.argv[2];\n'
            'const first = ({})[key];\n'
            '{ const first = 0; }\n'
            'const run = first[key];\n'
            '{ const run = 0; }\n'
            'run("return process[\'e\' + \'nv\'].HOME")();\n',
            "computed constructor-capable access",
        ),
        "property-assigned-constructor-chain": (
            'let key = process.argv[2];\n'
            'const obj = {};\n'
            'const box = {};\n'
            'box.first = obj[key];\n'
            'box.run = box.first[key];\n'
            'box.run("return process[\'e\' + \'nv\'].HOME")();\n',
            "computed call target",
        ),
        "reflect-get-constructor-chain": (
            'const key = process.argv.at(2);\n'
            'const first = Reflect.get({}, key);\n'
            'const run = Reflect.get(first, key);\n'
            'run("return process[\'e\' + \'nv\'].HOME")();\n',
            "reflective property access: Reflect",
        ),
        "descriptor-constructor-access": (
            'const key = process.argv.at(2);\n'
            'Object.getOwnPropertyDescriptor({}, key).value;\n',
            "reflective property access: getOwnPropertyDescriptor",
        ),
        "process-property-reexport": (
            'export { env } from "node:process";\n',
            "forbidden process property: env",
        ),
        "process-default-reexport": (
            'export { default as proc } from "node:process";\n',
            "indirect process access: default re-export",
        ),
        "process-export-all": (
            'export * from "node:process";\n',
            "indirect process access: node:process re-export",
        ),
    }
    for name, (source, expected) in fixtures.items():
        try:
            scan_source(
                f"regression/{name}.mjs",
                source,
                enforce_approved_bytes=False,
            )
        except ScanError as error:
            if expected not in str(error):
                raise ScanError(f"{name} regression failed unexpectedly: {error}") from error
            continue
        raise ScanError(f"{name} regression bypassed the security gate")

    try:
        scan_source(
            SCRIPTS[0],
            'const key = process.argv[2]; ({})[key][key]("return 1")();\n',
        )
    except ScanError as error:
        if "unapproved runtime bytes" not in str(error):
            raise ScanError(f"approved-bytes regression failed: {error}") from error
    else:
        raise ScanError("approved-bytes regression bypassed the security gate")


def validate_script_digest(relative_path: str, payload: bytes) -> str:
    digest = hashlib.sha256(payload).hexdigest()
    expected = EXPECTED_SCRIPT_SHA256.get(relative_path)
    if expected is None:
        raise ScanError(f"{relative_path}: missing approved sha256")
    if digest != expected:
        raise ScanError(
            f"{relative_path}: unapproved runtime bytes: "
            f"expected sha256={expected}, actual sha256={digest}"
        )
    return digest


def scan_script(relative_path: str) -> str:
    path = REPO_ROOT / relative_path
    if not path.is_file():
        raise ScanError(f"{relative_path}: missing")
    payload = path.read_bytes()
    digest = validate_script_digest(relative_path, payload)
    try:
        source = payload.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ScanError(f"{relative_path}: runtime is not UTF-8") from error
    scan_source(relative_path, source, enforce_approved_bytes=False)

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
