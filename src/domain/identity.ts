import type { DiscoveredSkill } from './discovery'

export type SkillConflict = {
  path: string
  directoryName: string
  declaredName: string | null
  reason: 'missing-name' | 'name-mismatch'
}

export type SkillGroup = {
  id: string
  name: string
  description: string
  installations: DiscoveredSkill[]
}

export function groupDiscoveredSkills(skills: DiscoveredSkill[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>()
  for (const skill of skills) {
    const current = groups.get(skill.id)
    if (current) current.installations.push(skill)
    else groups.set(skill.id, { id: skill.id, name: skill.name, description: skill.description, installations: [skill] })
  }
  return [...groups.values()]
}

export function isIdentityConflict(directoryName: string, declaredName: string | undefined): boolean {
  return !declaredName || directoryName !== declaredName
}
