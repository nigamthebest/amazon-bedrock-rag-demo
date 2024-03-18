

import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';

export class amazonBedrockRagDemoInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an Amazon ECR repository if it doesn't exist
    const ecrRepo = new ecr.Repository(this, 'BedrockDemoEcrRepo', {
      repositoryName: 'bedrock-ecr-repo' // Change this to your desired repository name
    });

    // Create a Fargate cluster
    const cluster = new ecs.Cluster(this, 'BedrockDemoEcsCluster', {
      clusterName: 'bedrock-demo-fargate-cluster' // Change this to your desired cluster name
    });

    // Create a load-balanced Fargate service
    const loadBalancedFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'BedrockDemoFargateService', {
      cluster,
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepo),
        containerPort: 80 // Change this to your desired container port
      },
      desiredCount: 2, // Change this to your desired number of tasks
      memoryLimitMiB: 512, // Change this to your desired memory limit
      cpu: 256 // Change this to your desired CPU units
    });

    // Output the load balancer DNS name
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: loadBalancedFargateService.loadBalancer.loadBalancerDnsName
    });
  }
}

const app = new cdk.App();
new amazonBedrockRagDemoInfraStack(app, 'amazonBedrockRagDemoInfraStack');
