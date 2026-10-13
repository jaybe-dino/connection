"""Read-only AWS CLI preflight. Never prints credentials, creates resources or sends email."""
import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone


def read(args):
    proc = subprocess.run(['aws'] + args + ['--output', 'json', '--no-cli-pager'], capture_output=True, text=True, timeout=30)
    if proc.returncode:
        # Do not echo raw stderr/configuration values.
        raise RuntimeError('AWS read failed: check existing login, region and read permissions.')
    return json.loads(proc.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region', required=True)
    parser.add_argument('--domain', action='append', default=[])
    args = parser.parse_args()
    result = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'region': args.region, 'readOnly': True, 'liveSendingPerformed': False}
    if not shutil.which('aws'):
        result.update(status='blocked', reason='AWS CLI unavailable. Use existing AWS console session; do not create credentials in chat.')
    else:
        try:
            who = read(['sts', 'get-caller-identity'])
            result['accountSuffix'] = who['Account'][-4:]
            account = read(['sesv2', 'get-account', '--region', args.region])
            quota = account.get('SendQuota', {})
            result['ses'] = {k: account.get(k) for k in ['ProductionAccessEnabled', 'SendingEnabled', 'EnforcementStatus']}
            result['quota'] = {k: quota.get(k) for k in ['Max24HourSend', 'MaxSendRate', 'SentLast24Hours']}
            result['providerResidualEstimate'] = max(0, quota['Max24HourSend'] - quota['SentLast24Hours']) if all(k in quota for k in ['Max24HourSend', 'SentLast24Hours']) else None
            result['identities'] = []
            for domain in args.domain:
                item = read(['sesv2', 'get-email-identity', '--email-identity', domain, '--region', args.region])
                result['identities'].append({'domain': domain, 'verifiedForSending': item.get('VerifiedForSendingStatus'),
                    'verificationStatus': item.get('VerificationStatus'), 'dkimStatus': item.get('DkimAttributes', {}).get('Status'),
                    'mailFromStatus': item.get('MailFromAttributes', {}).get('MailFromDomainStatus'), 'configurationSet': item.get('ConfigurationSetName')})
            result['status'] = 'read_complete_not_delivery_verified'
        except (RuntimeError, subprocess.TimeoutExpired, ValueError, KeyError):
            result.update(status='blocked', reason='Read-only AWS check incomplete. Confirm existing login, region and permissions.')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
