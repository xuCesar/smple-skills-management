# Skill Management

This context describes the language used to discover, inspect, install, and manage AI agent skills for an individual developer.

## Language

**Skill**:
A reusable set of agent instructions whose canonical identity is declared by the `name` in its `SKILL.md`. Its containing directory is its physical location, not its identity.
_Avoid_: Plugin, extension, prompt

**Skill installation**:
One physical copy of a Skill in a configured Skill directory. A Skill may have multiple installations without becoming multiple Skills.
_Avoid_: Skill instance, duplicate Skill

**Skill directory**:
A filesystem location that the user has selected for Skill discovery or installation.
_Avoid_: Workspace, registry

**Default Skill directory**:
A well-known Skill directory associated with a supported agent tool and included as an initial discovery option.
_Avoid_: System directory, built-in directory

**Skill source**:
The external origin from which a Skill installation was obtained, such as a GitHub repository.
_Avoid_: Skill directory, registry

**Public GitHub source**:
A GitHub repository that can be accessed without private credentials. Private repositories are outside the initial product boundary.
_Avoid_: Trusted source, verified source

**Skill library**:
The local catalog of discovered Skill identities and their physical installations. Listing a Skill in the library does not change whether another agent tool can read it.
_Avoid_: Workspace, activation list

**Scan snapshot**:
The most recent result of an explicit filesystem scan, which may be stale until the user scans again.
_Avoid_: Live index, cache

**Stale installation**:
A previously discovered Skill installation whose configured path is no longer available at the time of a later scan.
_Avoid_: Deleted Skill, broken Skill

**Hidden Skill preference**:
A Skill Desk preference to omit an externally discovered Skill from normal library views without changing its files or scan directories.
_Avoid_: Ignored Skill, disabled Skill

**Hidden Skill recovery**:
The library path for viewing and restoring Skills omitted by a Hidden Skill preference.
_Avoid_: Re-scan visibility, deleted item recovery

**Skill conflict**:
A condition where a Skill installation's directory name and its declared `name` disagree, or where installations with the same identity cannot be safely treated as equivalent.
_Avoid_: Duplicate

**Skill conflict report**:
An explicit scan result for an installation that cannot safely enter the Skill library because its identity or structure is ambiguous.
_Avoid_: Invalid Skill, scan error

**Invalid Skill directory**:
A user-selected or discovered directory that does not contain the required Skill declaration and therefore is not a Skill.
_Avoid_: Broken Skill, unsupported Skill

**Skill review**:
The user's inspection and approval of a Skill source and its contents before installation.
_Avoid_: Verification, trust

**Review boundary**:
The rule that Skill review reads and displays source content but never executes files from that source.
_Avoid_: Safe execution, sandbox approval

**Repository locator**:
The accepted public GitHub repository reference for obtaining a Skill, using either a full HTTPS URL or an `owner/repo` form.
_Avoid_: Git remote, repository credential

**Install confirmation**:
The user's explicit approval of both a reviewed source and the selected Installation target before files are written.
_Avoid_: One-click install, implicit approval

**Managed installation**:
A Skill installation created by Skill Desk and therefore eligible for source-aware update and uninstall operations.
_Avoid_: Owned Skill, internal Skill

**Managed configuration**:
Skill Desk's application-level record of Skill directories, scan snapshots, source metadata, and user preferences. It does not live inside Skill directories or project repositories.
_Avoid_: Skill metadata file, project config

**Installation target**:
The specific Skill directory selected for one install, update, or uninstall operation when a Skill has multiple physical installations.
_Avoid_: Workspace target, destination workspace

**Skill diff**:
A comparison of two complete Skill directory states, showing added, changed, and removed files before an update is confirmed.
_Avoid_: File preview, patch summary

**Atomic replacement**:
The update or install boundary in which a complete new Skill directory becomes visible only after preparation succeeds; a failed operation leaves the prior installation intact.
_Avoid_: Partial install, in-place update

**Configuration recovery**:
The preservation and replacement of an unreadable or malformed Managed configuration so Skill Desk can start with a clean configuration without losing the prior file.
_Avoid_: Silent reset, auto-migration

**Skill directory set**:
The normalized, de-duplicated collection of user-approved directories used for Skill discovery.
_Avoid_: Scan list, directory queue
