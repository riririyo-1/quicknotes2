# QuickNotes README

## 📌 プロジェクト概要

QuickNotes は **Next.js + AWS CDK + Cognito + API Gateway + Lambda** を利用したモダンなメモアプリです。フロントエンドは Amplify のライブラリを使いますが、インフラは CDK 管理のため **Amplify Console 上には表示されません**。

---

## 🛠 技術スタック

- **フロントエンド**: Next.js (14.x), TypeScript, Tailwind CSS
- **認証**: AWS Cognito + Google OAuth (Amplify Auth ライブラリ利用)
- **バックエンド**: API Gateway + Lambda (Node.js)
- **インフラ管理**: AWS CDK (TypeScript)
- **Secrets 管理**: AWS Secrets Manager

---

## ⚙️ 環境変数設定

`.env.local` に以下を設定してください。

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_HOSTED_DOMAIN=<Cognitoドメイン>
NEXT_PUBLIC_USER_POOL_ID=<Cognito User Pool ID>
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<Cognito User Pool Client ID>
API_URL=https://<your-api-id>.execute-api.ap-northeast-1.amazonaws.com
```

AWS CLI / CDK 用の環境変数:

```env
AWS_ACCOUNT_ID=<AWSアカウント番号>
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=<IAMユーザーキー or OIDC認証>
AWS_SECRET_ACCESS_KEY=<シークレットキー>
```

---

## 🚀 ローカル開発手順

1. 依存インストール

   ```bash
   pnpm install
   ```

2. CDK でインフラデプロイ

   ```bash
   cd infra
   cdk bootstrap
   cdk deploy
   ```

3. Next.js 起動

   ```bash
   cd frontend
   pnpm dev
   ```

4. ブラウザで `http://localhost:3000` にアクセス

---

## 🔑 認証フロー

1. `Sign in with Google` をクリック
2. Google OAuth → Cognito Hosted UI → JWT 取得
3. JWT を API Gateway (JWT Authorizer) に付与して認証

- API 呼び出し例:
  ```ts
  const res = await fetch(`${API_URL}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ title: "test note" }),
  });
  ```

---

## ⚠️ よくあるエラーと解決

- **`OPTIONS 401 Unauthorized`**

  - 原因: API Gateway の Preflight に Authorizer を適用している
  - 対策: `OPTIONS` メソッドは **認証なし** にする

- **`redirects?.find is not a function`**

  - 原因: Amplify Auth 設定で `redirectSignIn` を配列にしていない
  - 対策: `redirectSignIn: ["<URL>"]` のように必ず配列で指定

- **`user.email: Attribute cannot be updated`**
  - 原因: Google OAuth で既存ユーザーの email 更新が発生
  - 対策: Cognito ユーザープールの属性設定を確認 (`email` を更新不可にする)

---

## 📝 補足

- **Amplify Console** にはアプリは表示されません（CDK 管理のため）
- CI/CD は GitHub Actions → OIDC → IAM ロール AssumeRole がベストプラクティス
- Secrets は AWS Secrets Manager に保存（例: Google OAuth クライアント ID/Secret）

---

## 📚 参考リンク

- [AWS Amplify Auth ドキュメント](https://docs.amplify.aws/react/build-a-backend/auth/)
- [AWS CDK](https://docs.aws.amazon.com/cdk/)
- [Next.js](https://nextjs.org/docs)
