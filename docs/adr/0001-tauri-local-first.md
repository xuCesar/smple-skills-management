# Use Tauri for a macOS-first local Skill Desk

Skill Desk will use Tauri as its desktop host while retaining a React/Vite frontend workflow. The product is local-first: Skill directories are read from the user's machine and Managed configuration is stored under macOS Application Support, avoiding a server, account system, or repository-scoped state in the initial product.

## Consequences

- Native filesystem and macOS integration stay behind the desktop boundary.
- The frontend can continue to iterate independently through the Vite dev server.
- A future Windows/Linux target remains possible, but macOS behavior is the first compatibility contract.
