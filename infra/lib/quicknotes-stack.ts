import { Duration, Stack, StackProps, CfnOutput, Token } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwAuth from "aws-cdk-lib/aws-apigatewayv2-authorizers";

export class QuickNotesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // === Secrets (Google OAuth) ===
    // 事前に CLI 等で `quicknotes/google-oauth` を作成しておく
    const googleSecret = secrets.Secret.fromSecretNameV2(
      this,
      "GoogleOAuth",
      "quicknotes/google-oauth"
    );

    // === Cognito (User Pool + Hosted UI) ===
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } }, // 更新可能に
    });

    const domain = userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: `quicknotes-${this.account}` },
    });

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleIdP",
      {
        userPool,
        clientId: Token.asString(googleSecret.secretValueFromJson("clientId")),
        clientSecretValue: googleSecret.secretValueFromJson("clientSecret"),
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      }
    );

    const callbackUrls = [
      "http://localhost:3000/auth/callback",
      // Amplify 本番 URL は後で追記（コンソール or CDK 再デプロイ）
    ];

    const logoutUrls = ["http://localhost:3000"];

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls,
        logoutUrls,
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });
    userPoolClient.node.addDependency(googleProvider);

    // === DynamoDB (Notes) ===
    const table = new dynamodb.Table(this, "NotesTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "noteId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    table.addGlobalSecondaryIndex({
      indexName: "ByCreatedAt",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    // === S3 (images) ===
    const bucket = new s3.Bucket(this, "ImagesBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(365) }],
    });

    bucket.addCorsRule({
      allowedOrigins: ["http://localhost:3000"],
      allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
      allowedHeaders: ["*"],
      maxAge: 3600,
    });

    // === Lambda ===
    const fn = new lambdaNode.NodejsFunction(this, "NotesApiFn", {
      entry: "lambda/notes.ts",
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
    });

    table.grantReadWriteData(fn);
    bucket.grantReadWrite(fn);

    // === API Gateway (HTTP API) + Cognito JWT Authorizer ===
    // （そのまま）CORS は API Gateway に任せる
    const api = new apigwv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowHeaders: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: ["http://localhost:3000"],
      },
    });

    const authorizer = new apigwAuth.HttpUserPoolAuthorizer(
      "JwtAuth",
      userPool,
      {
        userPoolClients: [userPoolClient],
        identitySource: ["$request.header.Authorization"],
      }
    );

    // ✅ /notes は GET/POST のみ（OPTIONS は作らない）
    api.addRoutes({
      path: "/notes",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "NotesIntegrationRoot",
        fn
      ),
      authorizer,
    });

    // ✅ /notes/{proxy+} は presign(POST) / 削除(DELETE) / 取得(GET) 用
    api.addRoutes({
      path: "/notes/{proxy+}",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: new integrations.HttpLambdaIntegration(
        "NotesIntegrationProxy",
        fn
      ),
      authorizer,
    });

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "HostedDomain", { value: domain.baseUrl() });
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
  }
}
