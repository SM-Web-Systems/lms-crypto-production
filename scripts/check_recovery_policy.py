#!/usr/bin/env python3
"""Compare a retained private capture and recovery policy without executing recovery."""
import argparse
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import release_recovery as recovery


def check(capture_path, capture_sha256, policy_path):
    recovery.require(recovery.HASH.fullmatch(capture_sha256), 'INDEPENDENT_CAPTURE_HASH_REQUIRED')
    capture = recovery.read_private_json(capture_path, expected_sha256=capture_sha256)
    capture_id = capture.get('manifest_id')
    recovery.require(capture.get('version') == 1 and capture.get('eligibility') == 'UNVERIFIED'
                     and isinstance(capture_id, str) and re.fullmatch(r'[0-9a-f]{32}', capture_id),
                     'RETAINED_CAPTURE_REQUIRED')
    policy = recovery.read_private_json(policy_path)
    recovery.verify_policy(capture['target'], capture['backup'], policy)
    return {'status': 'POLICY_MATCHES_RECORDED_CAPTURE', 'recovery_eligibility_verified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', required=True, help='absolute path to a retained private capture JSON')
    parser.add_argument('--expected-capture-sha256', required=True, help='capture digest from an independent record')
    parser.add_argument('--policy', required=True, help='absolute path to the private recovery policy JSON')
    args = parser.parse_args()
    result = {'status': 'REFUSED', 'recovery_eligibility_verified': False}
    try:
        print(json.dumps(check(args.capture, args.expected_capture_sha256, args.policy), sort_keys=True))
        return 0
    except recovery.CompatibilityPolicyMismatch as error:
        result.update(code=str(error), mismatched_fields=error.fields)
    except recovery.ReleaseError as error:
        result['code'] = str(error)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        result['code'] = 'INVALID_CAPTURE_OR_POLICY'
    print(json.dumps(result, sort_keys=True), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
