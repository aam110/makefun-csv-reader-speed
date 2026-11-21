// Entry point the harness runs: reads every case from /input/cases.json,
// answers each with run() from solve.js, writes /output/answers.json.
// MAKEFUN_INPUT / MAKEFUN_OUTPUT override the paths for local testing.
import { setFlagsFromString } from "node:v8";

// Turn V8's incremental marking off before importing solve.js, as the
// house baseline's driver does.
setFlagsFromString("--no-incremental-marking");

import fs from "node:fs";
import path from "node:path";

const { run } = await import("./solve.js");

const inputPath = process.env.MAKEFUN_INPUT ?? "/input/cases.json";
const outputPath = process.env.MAKEFUN_OUTPUT ?? "/output/answers.json";

const cases = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const answers = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  answers[i] = run(cases[i].input);
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(answers));
