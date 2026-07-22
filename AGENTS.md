This is a Pi-native executable research workshop, not a product or generic
framework. Read `VISION.md`, then `incubator/README.md`.

Before applying work from this repository elsewhere:

- Identify the specific idea relevant to the target project.
- Treat Crust, Pocock, CLIs, workflows, names, and state machines as examples,
  not defaults to copy.
- Prefer grilling the user and making the smallest useful probe over extending
  a taxonomy or framework.
- Put active idea-specific work in `incubator/<idea-name>/`.
- Move shared code to `src/` only when reuse friction earns it.
- Move shared explanation to `docs/` on the same basis.
- Never import active code from `archive/`.

`.env` in the repository root contains an OpenRouter API key. Do not expose it.

`incubator/dependency-upgrade/fixture` is an isolated Bun project pinned to
`minimatch@3`. Root dependency resolution uses `minimatch@10`. Keep its
verification outside Bun's root test discovery and run it through the fixture's
own script; `bun run test` does this.
