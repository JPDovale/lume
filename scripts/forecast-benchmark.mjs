import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const dir = mkdtempSync(join(tmpdir(), "lume-benchmark-"));
try {
  await build({
    entryPoints: ["src/domain/forecasting/series.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: join(dir, "model.mjs"),
  });
  const { forecastSeries } = await import(
    pathToFileURL(join(dir, "model.mjs"))
  );
  const year = [
    12000, 15000, 10000, 13000, 16000, 20000, 12000, 8000, 14000, 17000, 11000,
    50000,
  ];
  const cases = {
    stable: Array(36).fill(20000),
    trend: Array.from({ length: 36 }, (_, i) => 10000 + i * 800),
    levelChange: [...Array(18).fill(10000), ...Array(18).fill(18000)],
    annual: [...year, ...year, ...year],
    isolatedSpike: Array.from({ length: 36 }, (_, i) =>
      i === 24 ? 180000 : 20000,
    ),
    intermittent: Array.from({ length: 36 }, (_, i) => (i % 2 ? 0 : 20000)),
  };
  const results = [];
  for (const [name, series] of Object.entries(cases))
    for (const horizon of [1, 2, 6]) {
      const errors = [],
        naive = [],
        average = [];
      for (let target = 24; target < series.length; target++) {
        const prefix = series.slice(0, target - horizon + 1);
        if (prefix.length < 3) continue;
        errors.push(
          Math.abs(series[target] - forecastSeries(prefix, horizon).expected),
        );
        naive.push(Math.abs(series[target] - prefix.at(-1)));
        average.push(
          Math.abs(
            series[target] - prefix.reduce((s, v) => s + v, 0) / prefix.length,
          ),
        );
      }
      const mae = (v) => Math.round(v.reduce((s, n) => s + n, 0) / v.length);
      results.push({
        scenario: name,
        horizon,
        tests: errors.length,
        modelMae: mae(errors),
        naiveMae: mae(naive),
        meanMae: mae(average),
      });
    }
  const report = {
    version: "cashflow-v2",
    data: "Synthetic deterministic scenarios; no personal data; MAE in cents; not an independent real-world accuracy claim.",
    results,
  };
  writeFileSync(
    resolve("docs/forecast-benchmark.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.table(results);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
