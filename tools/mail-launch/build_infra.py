"""Generate a disabled SES stack. No AWS API calls, DNS mutation or email sending."""
import json
from pathlib import Path


def template():
    resources = {
        'Configuration': {'Type': 'AWS::SES::ConfigurationSet', 'DeletionPolicy': 'Retain', 'UpdateReplacePolicy': 'Retain', 'Properties': {
            'Name': {'Fn::Sub': '${AWS::StackName}-campaign'},
            'SendingOptions': {'SendingEnabled': False},
            'DeliveryOptions': {'TlsPolicy': 'REQUIRE'},
            'ReputationOptions': {'ReputationMetricsEnabled': True},
            'SuppressionOptions': {'SuppressedReasons': ['BOUNCE', 'COMPLAINT']}}},
        'Identity': {'Type': 'AWS::SES::EmailIdentity', 'DeletionPolicy': 'Retain', 'UpdateReplacePolicy': 'Retain', 'Properties': {
            'EmailIdentity': {'Ref': 'Domain'}, 'DkimAttributes': {'SigningEnabled': True},
            'DkimSigningAttributes': {'NextSigningKeyLength': 'RSA_2048_BIT'},
            'ConfigurationSetAttributes': {'ConfigurationSetName': {'Ref': 'Configuration'}},
            'MailFromAttributes': {'MailFromDomain': {'Fn::Sub': 'bounce.${Domain}'}, 'BehaviorOnMxFailure': 'REJECT_MESSAGE'},
            'FeedbackAttributes': {'EmailForwardingEnabled': True}}},
        'FeedbackTopic': {'Type': 'AWS::SNS::Topic', 'DeletionPolicy': 'Retain', 'Properties': {}},
        'FeedbackTopicPolicy': {'Type': 'AWS::SNS::TopicPolicy', 'Properties': {'Topics': [{'Ref': 'FeedbackTopic'}], 'PolicyDocument': {
            'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'ses.amazonaws.com'}, 'Action': 'sns:Publish',
                'Resource': {'Ref': 'FeedbackTopic'}, 'Condition': {'StringEquals': {'AWS:SourceAccount': {'Ref': 'AWS::AccountId'}},
                    'ArnLike': {'AWS:SourceArn': {'Fn::Sub': 'arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:configuration-set/${Configuration}'}}}}]}}},
        'DeadLetter': {'Type': 'AWS::SQS::Queue', 'DeletionPolicy': 'Retain', 'Properties': {'SqsManagedSseEnabled': True, 'MessageRetentionPeriod': 1209600}},
        'FeedbackQueue': {'Type': 'AWS::SQS::Queue', 'DeletionPolicy': 'Retain', 'Properties': {
            'SqsManagedSseEnabled': True, 'MessageRetentionPeriod': 1209600, 'VisibilityTimeout': 120,
            'RedrivePolicy': {'deadLetterTargetArn': {'Fn::GetAtt': ['DeadLetter', 'Arn']}, 'maxReceiveCount': 5}}},
        'FeedbackQueuePolicy': {'Type': 'AWS::SQS::QueuePolicy', 'Properties': {'Queues': [{'Ref': 'FeedbackQueue'}], 'PolicyDocument': {
            'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'sns.amazonaws.com'}, 'Action': 'sqs:SendMessage',
                'Resource': {'Fn::GetAtt': ['FeedbackQueue', 'Arn']}, 'Condition': {'ArnEquals': {'aws:SourceArn': {'Ref': 'FeedbackTopic'}}}}]}}},
        'FeedbackSubscription': {'Type': 'AWS::SNS::Subscription', 'DependsOn': 'FeedbackQueuePolicy', 'Properties': {
            'TopicArn': {'Ref': 'FeedbackTopic'}, 'Protocol': 'sqs', 'Endpoint': {'Fn::GetAtt': ['FeedbackQueue', 'Arn']}, 'RawMessageDelivery': True}},
        'Events': {'Type': 'AWS::SES::ConfigurationSetEventDestination', 'DependsOn': ['FeedbackTopicPolicy', 'FeedbackSubscription'], 'Properties': {
            'ConfigurationSetName': {'Ref': 'Configuration'}, 'EventDestination': {'Name': 'operations-events', 'Enabled': True,
                'MatchingEventTypes': ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'RENDERING_FAILURE', 'DELIVERY_DELAY'],
                'SnsDestination': {'TopicARN': {'Ref': 'FeedbackTopic'}}}}}
    }
    outputs = {'ConfigurationName': {'Value': {'Ref': 'Configuration'}}, 'FeedbackQueueURL': {'Value': {'Ref': 'FeedbackQueue'}},
               'MailFromMXHost': {'Value': {'Fn::Sub': 'bounce.${Domain}'}},
               'MailFromMXValue': {'Value': {'Fn::Sub': '10 feedback-smtp.${AWS::Region}.amazonses.com'}},
               'MailFromSPF': {'Value': 'v=spf1 include:amazonses.com ~all'}}
    for i in range(1, 4):
        for part in ['Name', 'Value']:
            outputs['DKIM%d%s' % (i, part)] = {'Value': {'Fn::GetAtt': ['Identity', 'DkimDNSToken%s%d' % (part, i)]}}
    return {'AWSTemplateFormatVersion': '2010-09-09', 'Description': 'Theprlist mail preparation. Sending disabled. No email identities, IAM credentials, DNS changes or send worker.',
            'Parameters': {'Domain': {'Type': 'String', 'AllowedPattern': r'(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}',
                                      'Description': 'Owned domain only. Reuse existing SES identity instead of deploying a duplicate.'}},
            'Resources': resources, 'Outputs': outputs}


if __name__ == '__main__':
    path = Path(__file__).parent / 'ses-disabled-stack.json'
    path.write_text(json.dumps(template(), indent=2) + '\n', encoding='utf-8')
    print('Generated %s; no deployment or email sent.' % path.name)
