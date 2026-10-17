import type { Skill } from '../generated/Skill';

export const MAX_NAME = 64;
export const MAX_DESCRIPTION = 1024;

/** What is wrong with a skill, in plain words (the same rules as the server's). */
export function skillProblems(s: Skill, others: Skill[]): string[] {
  const out: string[] = [];
  const n = s.name;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n) || n.length > MAX_NAME) out.push(`The name must be 1–${MAX_NAME} lowercase letters, digits and single hyphens, such as money-rules.`);
  const d = s.description.trim();
  if (!d || [...d].length > MAX_DESCRIPTION) out.push(`The description says when to use the skill, in 1–${MAX_DESCRIPTION} characters.`);
  if (!s.body.trim()) out.push('The skill needs instructions.');
  if (others.some((o) => o.name === n)) out.push(`This agent already has a skill named ${n}.`);
  return out;
}

/** A SKILL.md: its frontmatter gives the name and description; the rest is the body. */
export function parseSkillMd(text: string): Skill | string {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(t);
  if (!m) return 'A SKILL.md starts with a --- block naming the skill.';
  const field = (key: string) => {
    const line = m[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
    return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  };
  const name = field('name');
  const description = field('description');
  if (!name || !description) return 'The SKILL.md frontmatter needs a name and a description.';
  return { name, description, body: m[2].replace(/^\n+/, '') };
}
