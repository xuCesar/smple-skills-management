# Use explicit manual discovery for the Skill library

Skill Desk will discover Skills through explicit user-triggered scans, with an immediate scan when a new Skill directory is added. The initial default Skill directory set is `~/.agents/skills`, `~/.codex/skills`, and `~/.claude/skills`; user-added paths are normalized and de-duplicated. A Skill enters the normal library only when its directory identity and `SKILL.md` declaration agree; ambiguous or invalid directories remain visible as reports rather than being silently coerced.

## Consequences

- Scan snapshots are intentionally allowed to become stale and are labelled as such.
- Multiple physical installations of one Skill can be shown together while preserving per-installation targets.
- Filesystem watchers and broad automatic discovery are out of scope for the initial product.
