# Roadmap

These are likely vertical slices, in order. Each slice should produce a
playable, inspectable change rather than only infrastructure.

## 1. Persistent planting

Click the ground to add a seed to `world.json`. The seed survives reloads and
appears in the entity inspector.

## 2. Direct manipulation

Drag selected entities in the game. Edit position, scale, and tint in the
inspector. Persist each change immediately.

## 3. Spark economy

Collect sparks and spend them to plant seeds. This creates the first complete
gameplay loop.

## 4. Growth lifecycle

Grow a seed into a sprout and then a mature moon tree. Use time and collected
sparks as inputs. Persist the growth stage.

## 5. Entity behaviors

Make moon trees emit motes and seeds attract them. World objects begin to
interact without player input.

## 6. Asset and entity catalog

Add an import command:

```bash
bun run entity import <asset>
```

Register the asset as a selectable and placeable entity type.

## 7. First creature

Generate a moon-moth. Let it wander, follow the player, and feed moon trees.
Expose its state in the inspector.

## 8. World mutation history

Record placements and edits with timestamps. Add undo, redo, and a visible
mutation timeline.

## 9. Codex MCP surface

Expose bounded tools for:

- Listing and inspecting entities.
- Reading game state.
- Placing, moving, scaling, and recoloring entities.
- Capturing the current game view.

## 10. Scribblenauts wish loop

Let the player describe something such as “a lantern-eating moon fox.” Codex
creates its asset and bounded behavior, previews the result, and introduces it
into the live world after acceptance.

Slices 1–5 establish the game. Slices 6–9 establish its authoring surface.
Slice 10 earns agentic world mutation.

## Reflection

Build a game worth changing before improving how Codex changes it. Keep
`world.json` and the later slices provisional: after each slice, ask what became
easier and let observed friction choose the next smallest probe.
