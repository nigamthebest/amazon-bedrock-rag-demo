import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class amazonBedrockRagDemoInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an Amazon ECR repository if it doesn't exist
    const ecrRepo = new ecr.Repository(this, "BedrockDemoEcrRepo", {
      repositoryName: "bedrock-demo-ecr-repo", // Change this to your desired repository name
    });

    const githubToken = new secretsmanager.Secret(this, 'GithubToken', {
      secretName: 'github-token',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ token: 'your-github-personal-access-token' }),
        generateStringKey: 'token',
      },
    });

    // Create a CodeBuild project
    const codeBuildProject = new codebuild.Project(this, "CodeBuildProject", {
      projectName: "bedrock-demo-codebuild-project",
      source: codebuild.Source.gitHub({
        owner: "your-github-username",
        repo: "amazon-bedrock-rag-demo",
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true,
      },
      environmentVariables: {
        ECR_REPO_URI: { value: ecrRepo.repositoryUri },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO_URI}",
            ],
          },
          build: {
            commands: [
              "docker build -t ${ECR_REPO_URI}:latest .",
              "docker push ${ECR_REPO_URI}:latest",
            ],
          },
        },
      }),
    });

    // Grant CodeBuild project access to ECR
    ecrRepo.grantPullPush(codeBuildProject.role!);

    // Create a CodePipeline
    const pipeline = new codepipeline.Pipeline(this, "BedrockDemoPipeline", {
      pipelineName: "bedrock-demo-pipeline",
    });

    // Add source stage
    const sourceOutput = new codepipeline.Artifact("SourceArtifact");
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: "GitHub",
      owner: "your-github-username",
      repo: "your-repo-name",
      oauthToken: secretsmanager.SecretVa.secretsManager(githubToken.secretArn).toString(),
      output: sourceOutput,
      branch: "main", // or the branch you want to use
    });
    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    // Add build stage
    const buildOutput = new codepipeline.Artifact("BuildArtifact");
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "CodeBuild",
      project: codeBuildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });
    pipeline.addStage({
      stageName: "Build",
      actions: [buildAction],
    });

    // Create a Fargate cluster
    const cluster = new ecs.Cluster(this, "BedrockDemoEcsCluster", {
      clusterName: "bedrock-demo-fargate-cluster", // Change this to your desired cluster name
    });

    // Create a load-balanced Fargate service
    const loadBalancedFargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        "BedrockDemoFargateService",
        {
          cluster,
          taskImageOptions: {
            image: ecs.ContainerImage.fromEcrRepository(ecrRepo),
            containerPort: 80, // Change this to your desired container port
          },
          desiredCount: 2, // Change this to your desired number of tasks
          memoryLimitMiB: 512, // Change this to your desired memory limit
          cpu: 256, // Change this to your desired CPU units
        }
      );

    // Output the load balancer DNS name
    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}

const app = new cdk.App();
new amazonBedrockRagDemoInfraStack(app, "amazonBedrockRagDemoInfraStack");
