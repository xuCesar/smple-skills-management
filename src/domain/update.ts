export type DiffKind = 'added' | 'changed' | 'removed'
export type SkillDiffEntry = { path: string; kind: DiffKind }
export type UpdateChoice = 'cancel' | 'overwrite-backup' | 'install-new-copy'

export function summarizeSkillDiff(previous: Record<string, string>, next: Record<string, string>): SkillDiffEntry[] {
  const paths = new Set([...Object.keys(previous), ...Object.keys(next)])
  const result: SkillDiffEntry[] = []
  for (const path of [...paths].sort()) {
    if (!(path in previous)) result.push({ path, kind: 'added' })
    else if (!(path in next)) result.push({ path, kind: 'removed' })
    else if (previous[path] !== next[path]) result.push({ path, kind: 'changed' })
  }
  return result
}

export function hasLocalChanges(installed: Record<string, string>, expected: Record<string, string>): boolean {
  return summarizeSkillDiff(expected, installed).length > 0
}
