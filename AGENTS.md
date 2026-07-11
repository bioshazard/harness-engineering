Note: .env in repo root contains openrouter api key

`poc/dependency-upgrade/fixture` is an isolated Bun project pinned to
`minimatch@3`. Do not let root `bun test` discover its tests: root dependency
resolution uses `minimatch@10`. Keep its verification outside Bun's root test
discovery and run it through the fixture's own script; `bun run test` does this.
