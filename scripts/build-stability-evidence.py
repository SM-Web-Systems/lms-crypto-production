#!/usr/bin/env python3
"""Convert protected copies of v2 monitor files plus owner attestations to offline evidence.

No network/collection, defaults, or production paths. This does not prove attestations true.
"""
import argparse
import csv
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
for flag in ['csv','deadman-log','heartbeat','attestations','output']: parser.add_argument('--'+flag,required=True)
args = parser.parse_args()
try:
    samples = []
    for row in csv.DictReader(Path(args.csv).read_text(encoding='utf8').splitlines()):
        for key in ['frontend_http','api_restarts','web_restarts','five_xx_count','disk_pct','api_uid']:
            row[key] = int(row[key])
        for key in ['api_read_only','collection_ok']:
            # Unknown reads must not become a true boolean.
            row[key] = row[key] == 'true'
        samples.append(row)
    deadman = []
    for line in Path(args.deadman_log).read_text(encoding='utf8').splitlines():
        match = re.match(r'^\[([^\]]+)\] (OK|ALERT):',line)
        if match: deadman.append({'timestamp':match[1],'status':'ok' if match[2]=='OK' else 'alert'})
    attested = json.loads(Path(args.attestations).read_text(encoding='utf8'))
    evidence = {key:attested[key] for key in ['backup','mail_probe','rollback'] if key in attested}
    evidence.update(samples=samples,deadman=deadman,heartbeat_at=Path(args.heartbeat).read_text(encoding='utf8').strip())
    Path(args.output).write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
except (OSError,ValueError,KeyError,TypeError) as error:
    parser.exit(1,f'Invalid/unreadable evidence inputs: {error}\n')
