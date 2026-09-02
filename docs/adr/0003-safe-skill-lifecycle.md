# Require review and atomic operations for Skill lifecycle changes

Skill Desk will support public GitHub sources only in the initial release. Before installation or update, it will show the source, revision, complete file list, and Skill contents without executing any source files. The user must confirm both the reviewed source and the installation target; installation and update use atomic replacement, and Managed installation removal goes to the macOS Trash.

## Consequences

- Remote Skills are treated as untrusted content until explicitly reviewed.
- Full-directory diffs are required when local changes may be overwritten.
- Failed installs or updates leave the previous installation intact.
- Private repository credentials, in-app Skill editing, and automatic script execution are outside the initial boundary.
