#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { QuickNotesStack } from "../lib/quicknotes-stack";

const app = new cdk.App();

const account = process.env.AWS_ACCOUNT_ID;
const region = process.env.AWS_REGION;

if (!account || !region) {
  throw new Error("AWS_ACCOUNT_ID と AWS_REGION を環境変数に設定してください");
}

new QuickNotesStack(app, "QuickNotesStack", {
  env: { account, region },
});
