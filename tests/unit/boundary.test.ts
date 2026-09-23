import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const VIOLATING_DIR = path.join(REPO_ROOT, "src/modules/providers/__boundary_fixture__");
const ADAPTER_TARGET_DIR = path.join(
  REPO_ROOT,
  "src/modules/providers/adapters/__boundary_fixture__",
);

function runDependencyCruiser(): { status: number | null } {
  const result = spawnSync(
    "npx",
    ["depcruise", "--config", ".dependency-cruiser.cjs", "src"],
    { cwd: REPO_ROOT, stdio: "pipe" },
  );
  return { status: result.status };
}

describe("provider adapter import boundary", () => {
  afterEach(() => {
    rmSync(VIOLATING_DIR, { recursive: true, force: true });
    rmSync(ADAPTER_TARGET_DIR, { recursive: true, force: true });
  });

  it("passes on the current tree (no module outside the registry imports an adapter)", () => {
    const result = runDependencyCruiser();

    expect(result.status).toBe(0);
  });

  it("fails the build when a non-registry module under src/modules imports a concrete adapter", () => {
    mkdirSync(ADAPTER_TARGET_DIR, { recursive: true });
    writeFileSync(
      path.join(ADAPTER_TARGET_DIR, "boundary-fixture-adapter.ts"),
      "export const boundaryFixtureAdapter = { sourceId: \"boundary-fixture\" };\n",
    );

    mkdirSync(VIOLATING_DIR, { recursive: true });
    writeFileSync(
      path.join(VIOLATING_DIR, "violation.ts"),
      'import { boundaryFixtureAdapter } from "../adapters/__boundary_fixture__/boundary-fixture-adapter";\n' +
        "export { boundaryFixtureAdapter };\n",
    );

    const result = runDependencyCruiser();

    expect(result.status).not.toBe(0);
  });
});
