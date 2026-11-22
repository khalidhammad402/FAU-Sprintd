#!/usr/bin/env node
// Fails when a forbidden word appears in a string or JSX text in src/ (build prompt, section 5).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [/\bhouseholds?\b/i, /\bhomeowners?\b/i, /\bhomes?\b/i, /\bclient portal\b/i, /\bsite owners?\b/i, /\bfree heat\b/i, /\bsmart home\b/i];
const SKIP = [/[\\/]api[\\/]schema\.ts$/, /[\\/]mocks[\\/]fixtures[\\/]/, /terms\.test\.ts$/];

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(p) && !SKIP.some((r) => r.test(p))) files.push(p);
  }
})("src");

const problems = [];
for (const f of files) {
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments may explain the rule
      const strings = line.match(/(["'`])(?:\\.|(?!\1).)*\1|>[^<>{}]+</g) ?? [];
      for (const s of strings) for (const re of FORBIDDEN) if (re.test(s)) problems.push(`${f}:${i + 1}  ${s.trim()}`);
    });
}
if (problems.length) {
  console.error("Forbidden visible terms (use src/lib/terms.ts):\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`terms ok (${files.length} files)`);
