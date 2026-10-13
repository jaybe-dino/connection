import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('mail_infra', str(ROOT / 'tools/mail-launch/build_infra.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MailInfraTests(unittest.TestCase):
    def setUp(self):
        self.template = MODULE.template()
        self.resources = self.template['Resources']

    def test_sending_disabled_and_no_dns_iam_lambda(self):
        self.assertFalse(self.resources['Configuration']['Properties']['SendingOptions']['SendingEnabled'])
        for resource in self.resources.values():
            self.assertFalse(resource['Type'].startswith(('AWS::IAM::', 'AWS::Route53::', 'AWS::Lambda::')))

    def test_domain_only_not_email_verification(self):
        param = self.template['Parameters']['Domain']
        self.assertNotIn('Default', param)
        self.assertIn('AllowedPattern', param)
        self.assertEqual(self.resources['Identity']['Properties']['EmailIdentity'], {'Ref': 'Domain'})

    def test_authentication_and_fail_closed_mailfrom(self):
        identity = self.resources['Identity']['Properties']
        self.assertEqual(identity['DkimSigningAttributes']['NextSigningKeyLength'], 'RSA_2048_BIT')
        self.assertEqual(identity['MailFromAttributes']['BehaviorOnMxFailure'], 'REJECT_MESSAGE')
        self.assertEqual(self.resources['Configuration']['Properties']['DeliveryOptions']['TlsPolicy'], 'REQUIRE')

    def test_events_include_delivery_bounce_complaint_not_engagement_tracking(self):
        events = self.resources['Events']['Properties']['EventDestination']['MatchingEventTypes']
        for required in ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'RENDERING_FAILURE', 'DELIVERY_DELAY']:
            self.assertIn(required, events)
        self.assertNotIn('OPEN', events)
        self.assertNotIn('CLICK', events)

    def test_sqs_feedback_only_not_email_subscription(self):
        self.assertEqual(self.resources['FeedbackSubscription']['Properties']['Protocol'], 'sqs')
        self.assertTrue(self.resources['FeedbackQueue']['Properties']['SqsManagedSseEnabled'])
        self.assertIn('RedrivePolicy', self.resources['FeedbackQueue']['Properties'])

    def test_queue_policy_restricts_topic(self):
        st = self.resources['FeedbackQueuePolicy']['Properties']['PolicyDocument']['Statement'][0]
        self.assertEqual(st['Principal'], {'Service': 'sns.amazonaws.com'})
        self.assertEqual(st['Condition'], {'ArnEquals': {'aws:SourceArn': {'Ref': 'FeedbackTopic'}}})

    def test_ses_publish_policy_restricts_account_and_configuration(self):
        st = self.resources['FeedbackTopicPolicy']['Properties']['PolicyDocument']['Statement'][0]
        self.assertEqual(st['Principal'], {'Service': 'ses.amazonaws.com'})
        self.assertIn('StringEquals', st['Condition'])
        self.assertIn('ArnLike', st['Condition'])

    def test_generated_template_matches_builder(self):
        actual = json.loads((ROOT / 'tools/mail-launch/ses-disabled-stack.json').read_text())
        self.assertEqual(actual, self.template)


if __name__ == '__main__':
    unittest.main()
