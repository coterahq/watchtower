import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGES_DIR = join(ROOT, "packages");

/** Every workspace package, with its manifest already parsed. */
export function readPackages() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(PACKAGES_DIR, entry.name);
      const manifestPath = join(dir, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      return { dir, manifestPath, manifest, name: manifest.name, version: manifest.version };
    })
    .filter((pkg) => pkg.manifest.private !== true);
}

/**
 * Order packages so that every package is published after the workspace
 * packages it depends on. Ties are broken by name so runs are reproducible.
 */
export function publishOrder(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const dependsOn = new Map(
    packages.map((pkg) => {
      const declared = {
        ...pkg.manifest.dependencies,
        ...pkg.manifest.peerDependencies,
        ...pkg.manifest.optionalDependencies,
      };
      return [pkg.name, Object.keys(declared).filter((dep) => byName.has(dep))];
    }),
  );

  const ordered = [];
  const pending = new Set(byName.keys());
  while (pending.size > 0) {
    const ready = [...pending]
      .filter((name) => dependsOn.get(name).every((dep) => !pending.has(dep)))
      .sort();
    if (ready.length === 0) {
      throw new Error(`Dependency cycle between workspace packages: ${[...pending].sort().join(", ")}`);
    }
    for (const name of ready) {
      ordered.push(byName.get(name));
      pending.delete(name);
    }
  }
  return ordered;
}

export const LOCKFILE = join(ROOT, "bun.lock");

/**
 * The workspace versions recorded in bun.lock, as a Map of name -> version.
 *
 * These matter because `bun publish` rewrites the `workspace:^` ranges between
 * our packages using the *lockfile*, not the current manifests. bun.lock is
 * JSONC rather than strict JSON, so the entries are read by pattern.
 */
export function readLockfileVersions() {
  const source = readFileSync(LOCKFILE, "utf8");
  const entries = [...source.matchAll(/"name":\s*"([^"]+)",\s*"version":\s*"([^"]+)"/g)];
  return new Map(entries.map((match) => [match[1], match[2]]));
}
