import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HELPER = path.join(HERE, "apple-nl-embedding.swift");

function safeReason(value) {
  return String(value || "UNKNOWN")
    .replace(/\s+/gu, " ")
    .slice(0, 240);
}

export function runAppleEmbedding(queries, fixture, helper = DEFAULT_HELPER) {
  const input = {
    queries,
    documents: fixture.cards.map((card) => ({
      card_id: card.card_id,
      texts: [card.public_question, card.scope_hint, ...card.retrieval_aliases]
    }))
  };
  const result = spawnSync("swift", [helper], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH }
  });
  if (result.error) return { available: false, reason: safeReason(result.error.code || result.error.message) };
  if (result.status !== 0) return { available: false, reason: safeReason(result.stderr || `EXIT_${result.status}`) };
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed.available !== true || !Array.isArray(parsed.rows) || parsed.rows.length !== queries.length) {
      return { available: false, reason: safeReason(parsed.reason || "INVALID_HELPER_OUTPUT") };
    }
    return parsed;
  } catch {
    return { available: false, reason: "INVALID_HELPER_JSON" };
  }
}
