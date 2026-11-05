"""Validate completion-plan dependencies, evidence hashes and local links offline."""
from pathlib import Path
from urllib.parse import unquote
import hashlib
import json
import re

repo = Path(__file__).resolve().parents[2]
release = repo / 'docs/release'
packet = repo / 'docs/audits/2026-11-05-lms-completion'
backlog = json.loads((release / 'LMS-COMPLETION-BACKLOG-2026-11-05.json').read_text(encoding='utf-8'))
tasks = {row['id']: row for row in backlog['tasks']}
if len(tasks) != len(backlog['tasks']):
    raise ValueError('Duplicate task IDs')
visiting, visited = set(), set()


def visit(key):
    if key not in tasks or key in visiting:
        raise ValueError(f'Unknown dependency or cycle: {key}')
    if key in visited:
        return
    row = tasks[key]
    if not row['ownerRole'] or not row['acceptance'] or row['priority'] not in ['P1', 'P2', 'P3']:
        raise ValueError(f'Incomplete task: {key}')
    visiting.add(key)
    for dependency in row['dependencies']:
        visit(dependency)
    visiting.remove(key)
    visited.add(key)
    if row['status'] == 'done':
        if not row['evidence']:
            raise ValueError(f'Missing closure evidence: {key}')
        for evidence in row['evidence']:
            if not (release / evidence).is_file():
                raise ValueError(f'Missing evidence: {evidence}')


for key in tasks:
    visit(key)
documents = [packet / 'AUDIT.md', release / 'LMS-COMPLETION-PLAN-2026-11-05.md', release / 'LMS-COMPLETION-STATUS.md']
for document in documents:
    content = document.read_text(encoding='utf-8')
    if 'RESULT_PENDING' in content:
        raise ValueError(f'Unresolved placeholder: {document.name}')
    for link in re.findall(r'\]\(([^)]+)\)', content):
        if re.match(r'https?://', link):
            continue
        target = unquote(link.split('#')[0])
        if not (document.parent / target).exists():
            raise ValueError(f'Broken local link in {document.name}: {link}')
plan = documents[1].read_text(encoding='utf-8')
if not all(key in plan for key in tasks):
    raise ValueError('Task missing from plan table')
evidence = packet / 'evidence'
manifest = json.loads((evidence / 'manifest.json').read_text(encoding='utf-8'))
for row in manifest['files']:
    file = (evidence / row['committedFile']).resolve()
    if not file.is_relative_to(evidence.resolve()):
        raise ValueError('Evidence path escapes packet')
    if hashlib.sha256(file.read_bytes()).hexdigest() != row['committedSha256']:
        raise ValueError(f'Evidence hash mismatch: {row["committedFile"]}')
for file in evidence.glob('*.json'):
    json.loads(file.read_text(encoding='utf-8'))
print(json.dumps({'tasks': len(tasks), 'dependencyGraph': 'acyclic', 'evidenceReceipts': len(manifest['files']),
                  'evidenceHashes': 'verified', 'markdownLinks': 'valid', 'json': 'valid'}, indent=2))
