import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('artifacts/api-server/package.json'));
const esbuild = await import(require.resolve('esbuild'));
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = await mkdtemp(path.join(os.tmpdir(), 'skills-service-'));
process.env.MISSION_CONTROL_SKILLS_DIR = path.join(root, 'skills');
process.env.MISSION_CONTROL_SKILLS_CACHE_DIR = path.join(root, 'cache');

async function git(args, cwd) {
  await exec('git', args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' } });
}

async function makeRepo(name, withSkill) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await git(['init', '-b', 'main'], dir);
  if (withSkill) {
    await mkdir(path.join(dir, 'nested'), { recursive: true });
    await writeFile(path.join(dir, 'nested', 'SKILL.md'), '---\nname: Remote Skill\ncategory: remote\n---\nUse remote skill.\n');
  } else {
    await writeFile(path.join(dir, 'README.md'), '# no skills\n');
  }
  await git(['add', '.'], dir);
  await git(['commit', '-m', 'initial'], dir);
  return dir;
}

const bundledService = path.join(root, 'skills-service.mjs');
await esbuild.build({ entryPoints: [path.resolve('artifacts/api-server/src/services/skills.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundledService });
const service = await import(bundledService);
try {
  await mkdir(path.join(process.env.MISSION_CONTROL_SKILLS_DIR, 'coding'), { recursive: true });
  await writeFile(path.join(process.env.MISSION_CONTROL_SKILLS_DIR, 'coding', 'SKILL.md'), '---\nname: Coding\ncategory: local\n---\nLocal.\n');
  await mkdir(path.join(process.env.MISSION_CONTROL_SKILLS_DIR, 'library', 'customli', 'llm-wiki'), { recursive: true });
  await writeFile(path.join(process.env.MISSION_CONTROL_SKILLS_DIR, 'library', 'customli', 'llm-wiki', 'SKILL.md'), '---\ntitle: LLM Wiki\ndescription: Local wiki maintenance.\ncategory: knowledge-management\nstatus: local\n---\nLocal wiki.\n');
  process.env.MISSION_CONTROL_EXTERNAL_SKILL_SOURCES = '[]';
  let listed = await service.listSkills();
  assert.equal(listed.skills.length, 2, 'local skill scan detects root and library SKILL.md files');
  const coding = listed.skills.find(s => s.name === 'Coding');
  assert.ok(coding, 'root local skill remains discoverable');
  assert.equal(coding.path, 'coding/SKILL.md', 'local skill path is readable, not base64');
  assert.equal(coding.source.localStatus, 'local', 'custom local skill is marked local');
  const llmWiki = listed.skills.find(s => s.name === 'LLM Wiki');
  assert.ok(llmWiki, 'nested library local skill is discoverable');
  assert.equal(llmWiki.path, 'library/customli/llm-wiki/SKILL.md', 'nested library skill preserves local path metadata');
  assert.equal(llmWiki.source.localStatus, 'local', 'nested library skill is marked local, not imported');
  assert.equal(llmWiki.description, 'Local wiki maintenance.', 'frontmatter description is parsed');
  assert.equal(llmWiki.category, 'knowledge-management', 'frontmatter category is parsed');
  assert.equal(llmWiki.status, 'local', 'frontmatter status is parsed');
  assert.equal(listed.origins.length, 0, 'custom local skills are not reported as import origins');

  const goodRepo = await makeRepo('good-repo', true);
  process.env.MISSION_CONTROL_EXTERNAL_SKILL_SOURCES = JSON.stringify([{ id: 'good', type: 'github', sourceUrl: `file://${goodRepo}`, sourceRepo: 'local/good', repoOwner: 'local', repoName: 'good', targetSkillName: null }]);
  let synced = await service.syncSkills();
  const good = synced.sources.find(s => s.sourceRepo === 'local/good');
  assert.equal(good?.status, 'available', 'external repo with SKILL.md is available');
  assert.equal(good?.branch, 'main', 'external repo branch is populated');
  assert.match(good?.commitHash ?? '', /^[0-9a-f]{40}$/i, 'external repo commit is populated');
  assert.equal(good?.skillCount, 1, 'external repo skill count is populated');
  const imported = synced.skills.find(s => s.source.sourceRepo === 'local/good');
  assert.ok(imported, 'external skill is imported into agent registry');
  assert.equal(imported.source.localStatus, 'imported', 'imported skill is marked imported');
  assert.equal(imported.path, 'library/imported/local/good/nested/SKILL.md', 'imported skill is copied into local library');
  assert.equal(imported.source.originPath, 'nested/SKILL.md', 'origin path metadata is persisted');
  assert.equal(imported.source.importedCommitSha, good?.commitHash, 'imported commit metadata is persisted');

  const emptyRepo = await makeRepo('empty-repo', false);
  process.env.MISSION_CONTROL_EXTERNAL_SKILL_SOURCES = JSON.stringify([{ id: 'empty', type: 'github', sourceUrl: `file://${emptyRepo}`, sourceRepo: 'local/empty', repoOwner: 'local', repoName: 'empty', targetSkillName: null }]);
  synced = await service.syncSkills();
  const empty = synced.sources.find(s => s.sourceRepo === 'local/empty');
  assert.equal(empty?.status, 'no_skills_found', 'repo with no SKILL.md gets no_skills_found');
  assert.match(empty?.error ?? '', /no SKILL\.md/i, 'no skill error is specific');

  process.env.GITHUB_TOKEN = 'test-token-not-used-for-file-url';
  process.env.MISSION_CONTROL_EXTERNAL_SKILL_SOURCES = JSON.stringify([{ id: 'missing', type: 'github', sourceUrl: `file://${path.join(root, 'missing-repo')}`, sourceRepo: 'local/missing', repoOwner: 'local', repoName: 'missing', targetSkillName: null }]);
  synced = await service.syncSkills();
  const missing = synced.sources.find(s => s.sourceRepo === 'local/missing');
  assert.ok(['not_found', 'error'].includes(missing?.status ?? ''), 'unavailable external repo gets a failure status');
  assert.ok(missing?.error, 'unavailable external repo stores real git error');
  listed = await service.listSkills();
  assert.ok(listed.skills.some(s => s.source.sourceRepo === 'local/good'), 'previously imported local skill remains available when another origin is unavailable');
  const docs = await service.readSkillsForDelegation({ names: ['Remote Skill'] });
  assert.equal(docs.length, 1, 'agent registry reads imported local SKILL.md files');
  assert.match(service.formatSkillsForPrompt(docs), /Path: library\/imported\/local\/good\/nested\/SKILL.md/, 'prompt formatting uses local path');

  console.log('skills service tests passed');
} finally {
  delete process.env.MISSION_CONTROL_EXTERNAL_SKILL_SOURCES;
  delete process.env.MISSION_CONTROL_SKILLS_DIR;
  delete process.env.MISSION_CONTROL_SKILLS_CACHE_DIR;
  await rm(root, { recursive: true, force: true });
}
