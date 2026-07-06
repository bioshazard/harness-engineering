import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { digest } from "./canonical.js";
import {
  phoenixPrompt,
  phoenixTelemetry,
  resolvePhoenixPrompt,
} from "./phoenix.js";
import { FileRegistryStore } from "./storage.js";
import {
  CATEGORIES,
  type Category,
  type ComponentDeclaration,
  type ComposeInput,
  type CompositionLock,
  type CompositionManifest,
  type Json,
  type LockedContext,
  type ManifestVersion,
  type Receipt,
  type ResolvedComponent,
  type ResolutionFailure,
  type StoredLock,
  type Telemetry,
  type Workflow,
} from "./types.js";

export * from "./types.js";
export { phoenixPrompt, phoenixTelemetry };

const NONE_CONTRACT = "goal-system.none/v1";

export function exact(
  name: string,
  id: string,
  options: { provider?: string; contract?: string; digest?: string } = {},
): ComponentDeclaration {
  return {
    name,
    provider: options.provider ?? "declared",
    contract: options.contract ?? "goal-system.exact/v1",
    selector: { type: "exact", id, digest: options.digest },
  };
}

export function local(
  name: string,
  path: string,
  contract: string,
): ComponentDeclaration {
  return {
    name,
    provider: "local-file",
    contract,
    selector: { type: "local", path },
  };
}

export function none(category: Category): ComponentDeclaration {
  return {
    name: `${category}:none`,
    provider: "none",
    contract: NONE_CONTRACT,
    selector: { type: "none" },
  };
}

export function workflow<TIntent, TDomain extends Json>(
  source: string,
  run: Workflow<TIntent, TDomain>["run"],
): Workflow<TIntent, TDomain> {
  return { source, run };
}

export function defaultProfile(
  overrides: Partial<Record<Category, ComponentDeclaration[]>> = {},
): Record<Category, ComponentDeclaration[]> {
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      overrides[category] ?? [none(category)],
    ]),
  ) as Record<Category, ComponentDeclaration[]>;
}

export function inMemoryTelemetry(): Telemetry {
  return {
    run(input, execute) {
      const traceId = digest(`${input.runId}:${input.compositionId}`).slice(7, 39);
      return execute(
        traceId,
        async (_id, _components, run) => run(),
        () => {},
        () => {},
      );
    },
  };
}

export class Registry {
  readonly store: FileRegistryStore;

  constructor(
    readonly options: {
      rootDir: string;
      registryDir: string;
      phoenix?: { endpoint: string; apiKey: string };
    },
  ) {
    this.store = new FileRegistryStore(options.registryDir);
  }

  async publish(manifest: CompositionManifest): Promise<ManifestVersion> {
    validateManifest(manifest);
    const version = {
      id: digest(manifest as unknown as Json),
      manifest,
    };
    await this.store.putManifest(version);
    return version;
  }

  async resolve(
    selector: string | ManifestVersion,
  ): Promise<StoredLock | ResolutionFailure> {
    const version =
      typeof selector === "string"
        ? await this.loadManifestVersion(selector)
        : selector;
    const failures: ResolutionFailure["failures"] = [];
    const components: ResolvedComponent[] = [];
    for (const category of CATEGORIES) {
      for (const declaration of version.manifest.components[category]) {
        try {
          components.push(await this.resolveOne(category, declaration));
        } catch (error) {
          failures.push({
            category,
            name: declaration.name,
            code: "UNRESOLVED_COMPONENT",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    if (failures.length) {
      return {
        kind: "resolution_failure",
        manifestVersionId: version.id,
        failures,
      };
    }
    components.sort((left, right) =>
      `${left.category}:${left.name}`.localeCompare(
        `${right.category}:${right.name}`,
      ),
    );
    const lock: CompositionLock = {
      schemaVersion: 1,
      manifestVersionId: version.id,
      manifestName: version.manifest.name,
      profile: version.manifest.profile,
      components,
    };
    const stored = {
      compositionId: digest(lock as unknown as Json),
      lock,
    };
    await this.store.putLock(stored);
    return stored;
  }

  async promote(
    alias: string,
    targetManifestVersionId: string,
    expectedCurrent?: string,
  ): Promise<void> {
    await this.store.promote(alias, targetManifestVersionId, expectedCurrent);
  }

  async load(compositionId: string): Promise<CompositionLock> {
    const lock = await this.store.getLock(compositionId);
    if (digest(lock as unknown as Json) !== compositionId) {
      throw new Error(`composition lock hash mismatch: ${compositionId}`);
    }
    return lock;
  }

  async verify(lock: CompositionLock): Promise<void> {
    for (const component of lock.components) {
      if (component.provider === "local-file") {
        const source = component.source as { path: string };
        const bytes = await readFile(resolve(this.options.rootDir, source.path));
        if (digest(bytes) !== component.digest) {
          throw new Error(`component drift: ${component.name}`);
        }
      }
      if (component.provider === "phoenix") {
        if (!this.options.phoenix) throw new Error("Phoenix is not configured");
        const source = component.source as { name: string; versionId: string };
        const verified = await resolvePhoenixPrompt(
          {
            name: component.name,
            provider: component.provider,
            contract: component.contract,
            selector: {
              type: "phoenix-prompt",
              name: source.name,
              versionId: source.versionId,
            },
          },
          this.options.phoenix.endpoint,
          this.options.phoenix.apiKey,
        );
        if (
          verified.immutableId !== component.immutableId ||
          verified.digest !== component.digest
        ) {
          throw new Error(`component drift: ${component.name}`);
        }
      }
    }
  }

  private async loadManifestVersion(selector: string): Promise<ManifestVersion> {
    let id = selector;
    if (!selector.startsWith("sha256:")) {
      if (selector.includes("@")) {
        id = await this.store.resolveAlias(selector);
      } else {
        id = await this.store.getNamedManifest(selector);
      }
    }
    return { id, manifest: await this.store.getManifest(id) };
  }

  private async resolveOne(
    category: Category,
    declaration: ComponentDeclaration,
  ): Promise<ResolvedComponent> {
    const selector = declaration.selector;
    if (selector.type === "none") {
      const immutableId = `none:${category}`;
      return {
        category,
        name: declaration.name,
        provider: declaration.provider,
        contract: declaration.contract,
        immutableId,
        digest: digest(immutableId),
        source: { type: "none" },
      };
    }
    if (selector.type === "exact") {
      if (!selector.id || selector.id.includes(":latest")) {
        throw new Error("exact identity is required");
      }
      return {
        category,
        name: declaration.name,
        provider: declaration.provider,
        contract: declaration.contract,
        immutableId: selector.id,
        digest: selector.digest ?? digest(selector.id),
        source: { type: "exact", id: selector.id },
      };
    }
    if (selector.type === "local") {
      const absolute = resolve(this.options.rootDir, selector.path);
      const path = relative(this.options.rootDir, absolute);
      if (isAbsolute(path) || path.startsWith("..")) {
        throw new Error(`local path escapes root: ${selector.path}`);
      }
      const bytes = await readFile(absolute);
      const contentDigest = digest(bytes);
      return {
        category,
        name: declaration.name,
        provider: declaration.provider,
        contract: declaration.contract,
        immutableId: `local-file:${path}:${contentDigest}`,
        digest: contentDigest,
        source: { type: "local", path },
      };
    }
    if (selector.type === "phoenix-prompt") {
      if (!this.options.phoenix) throw new Error("Phoenix is not configured");
      const resolved = await resolvePhoenixPrompt(
        declaration,
        this.options.phoenix.endpoint,
        this.options.phoenix.apiKey,
      );
      return { category, ...resolved };
    }
    throw new Error("unsupported selector");
  }
}

export async function compose<TIntent, TDomain extends Json>(
  input: ComposeInput<TIntent, TDomain>,
) {
  const rootDir = resolve(input.rootDir ?? process.cwd());
  const endpoint =
    process.env.PHOENIX_ENDPOINT ??
    process.env.PHOENIX_HOST ??
    "https://phoenix.talos.bios.dev";
  const apiKey = process.env.PHOENIX_API_KEY;
  const project = process.env.PHOENIX_PROJECT_NAME ?? "harness eng";
  const profile = defaultProfile(input.profile);
  profile.workflow = [
    local("workflow", input.workflow.source, "goal-system.workflow/v1"),
  ];
  if (input.prompt) {
    profile.prompts = Array.isArray(input.prompt)
      ? input.prompt
      : [input.prompt];
  }
  const manifest: CompositionManifest = {
    schemaVersion: 1,
    name: input.name,
    profile: "default/v1",
    components: profile,
  };
  const registry = new Registry({
    rootDir,
    registryDir: resolve(
      rootDir,
      input.registryDir ?? ".goal-systems/registry",
    ),
    ...(apiKey ? { phoenix: { endpoint, apiKey } } : {}),
  });
  const version = await registry.publish(manifest);
  const resolution = await registry.resolve(version);
  if ("kind" in resolution) {
    throw new Error(
      resolution.failures
        .map((failure) => `${failure.name}: ${failure.message}`)
        .join("\n"),
    );
  }
  const telemetry =
    input.telemetry ??
    (apiKey
      ? phoenixTelemetry({ endpoint, apiKey, project })
      : inMemoryTelemetry());

  return {
    compositionId: resolution.compositionId,
    manifestVersionId: version.id,
    lock: resolution.lock,
    async run(intent: TIntent): Promise<Receipt<TDomain>> {
      const lock = await registry.load(resolution.compositionId);
      const runId = crypto.randomUUID();
      return telemetry.run(
        {
          runId,
          compositionId: resolution.compositionId,
          manifestVersionId: version.id,
          components: lock.components,
        },
        async (traceId, transition, annotate, event) => {
          const finalize = (
            partial: Omit<Receipt<TDomain>, "id">,
          ): Receipt<TDomain> => {
            const receipt = {
              ...partial,
              id: digest(partial as unknown as Json),
            };
            annotate({
              "goal.terminal.verdict": receipt.terminalVerdict,
              "goal.receipt.id": receipt.id,
              "goal.receipt.artifact.count": receipt.artifacts.length,
              "goal.receipt.authority_decision.count":
                receipt.authorityDecisions.length,
            });
            return receipt;
          };
          const reject = (error: unknown): Receipt<TDomain> => finalize({
            schemaVersion: 1,
            runId,
            compositionId: resolution.compositionId,
            manifestVersionId: version.id,
            traceId,
            terminalVerdict: "reject",
            components: receiptComponents(lock.components),
            evaluatorIdentities: lock.components
              .filter((component) => component.category === "evaluators")
              .map((component) => component.immutableId),
            authorityDecisions: [],
            artifacts: [],
            domain: {
              error: error instanceof Error ? error.message : String(error),
            } as unknown as TDomain,
          });
          try {
            await registry.verify(lock);
          } catch (error) {
            return reject(error);
          }
          const context: LockedContext = {
            runId,
            compositionId: resolution.compositionId,
            traceId,
            components: lock.components,
            prompt(name) {
              const component = lock.components.find(
                (candidate) =>
                  candidate.category === "prompts" &&
                  candidate.name === name,
              );
              if (!component) throw new Error(`locked prompt not found: ${name}`);
              return component;
            },
            annotate,
            event,
            transition,
          };
          let result;
          try {
            result = await input.workflow.run(context, intent);
          } catch (error) {
            return reject(error);
          }
          return finalize({
            schemaVersion: 1,
            runId,
            compositionId: resolution.compositionId,
            manifestVersionId: version.id,
            traceId,
            terminalVerdict: result.terminalVerdict,
            components: receiptComponents(lock.components),
            evaluatorIdentities:
              result.evaluatorIdentities ??
              lock.components
                .filter((component) => component.category === "evaluators")
                .map((component) => component.immutableId),
            authorityDecisions: result.authorityDecisions ?? [],
            artifacts: result.artifacts ?? [],
            domain: result.domain,
          });
        },
      );
    },
  };
}

function receiptComponents(components: ResolvedComponent[]) {
  return components.map(
    ({ category, name, immutableId, digest: componentDigest }) => ({
      category,
      name,
      immutableId,
      digest: componentDigest,
    }),
  );
}

function validateManifest(manifest: CompositionManifest): void {
  if (manifest.schemaVersion !== 1) throw new Error("unknown manifest schema");
  if (!manifest.name.trim()) throw new Error("manifest name is required");
  const names = new Set<string>();
  for (const category of CATEGORIES) {
    const declarations = manifest.components[category];
    if (!Array.isArray(declarations) || declarations.length === 0) {
      throw new Error(`manifest category is required: ${category}`);
    }
    for (const declaration of declarations) {
      if (!declaration.contract.trim()) {
        throw new Error(`component contract is required: ${declaration.name}`);
      }
      const key = `${category}:${declaration.name}`;
      if (names.has(key)) throw new Error(`duplicate component: ${key}`);
      names.add(key);
    }
  }
}
