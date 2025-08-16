# QuickNotes 要件定義・設計・手順書（v1）

> 目的：**Amplify Gen2（Hosting） + AWS CDK（インフラ） + Next.js App Router（フロント） + GitHub Actions（CI/CD） + Google ログイン（Cognito Hosted UI）** を“全部乗せ”で実装・学習できる最小プロジェクト。

---

## 0. スコープ & 完了条件

**スコープ**

- Google アカウントでログイン（Cognito Hosted UI 経由）
- メモの CRUD（Create / List / Delete）
- メモは **テキスト + タグ配列 + 画像 1 枚**（任意）
- 検索：クライアント側のキーワード・タグ絞り込み（初期）
- 画像は S3 に保存（PUT/GET はプリサインド URL）
- API は API Gateway (HTTP API) + Lambda、認可は Cognito JWT
- データは DynamoDB（`userId`/`noteId`、作成日時 GSI）
- ホスティングは Amplify Gen2（GitHub 連携）
- CI：lint / typecheck / build、CDK のデプロイ（main）

**完了条件 (Definition of Done)**

- 未ログイン時：トップで「Sign in with Google」→ Hosted UI → Google で認証 → リダイレクト後にユーザー名/一覧が表示される
- 新規メモ作成ができ、画像アップロードが成功する（サムネイル表示）
- 一覧画面でテキスト/タグで絞り込みができる
- 削除ができる
- API を未認証で叩くと 401、認証済で 200
- Amplify で本番 URL が公開、GitHub Actions が通る

**非スコープ**（本ドキュメントでは扱わない）

- SSR/ISR の最適化、全文検索エンジン連携、CloudFront カスタム、画像変換
- 複雑なタグクエリ・権限周り（組織/共有）

---

## 1. ユースケース & 画面概要

**ユースケース**

- U1: ユーザーは Google でログインできる
- U2: ユーザーはメモ（本文・タグ・画像 1 枚）を作成できる
- U3: ユーザーは自分のメモ一覧を作成日時降順で閲覧できる
- U4: ユーザーはキーワード/タグでクライアント側フィルタができる
- U5: ユーザーはメモを削除できる

**画面**

- `/` トップ：

  - 未ログイン：Sign in with Google ボタン
  - ログイン済：検索バー、タグフィルタ、カード一覧、作成導線

- `/new` 作成：本文、タグ入力（カンマ区切り）、画像アップロード、保存

---

## 2. アーキテクチャ

```
Next.js (App Router) ── Amplify Auth (Hosted UI → Google)
        │                          │
        │ fetch + ID Token         │ OIDC (Google)
        ▼                          ▼
  API Gateway (HTTP API) ── JWT Authorizer (Cognito)
        │
        ▼
      Lambda ── DynamoDB(Notes) / S3(images presign)
```

**主要コンポーネント**

- **認証**: Cognito User Pool + Hosted UI + Google IdP
- **API**: API Gateway (HTTP API) + Lambda (Node.js 20)
- **データ**: DynamoDB テーブル `Notes`
- **画像**: S3 バケット `images`
- **IaC**: AWS CDK (TypeScript)
- **ホスティング**: Amplify Gen2（フロントのみ）
- **CI/CD**: GitHub Actions（チェック／CDK デプロイ）

**ディレクトリ**（`backend/` は作らない）

```
quicknotes/
├─ frontend/                # Next.js (App Router)
│  ├─ app/
│  ├─ components/
│  └─ amplify/
├─ infra/                   # CDK (TypeScript)
│  ├─ bin/
│  ├─ lib/
│  └─ lambda/               # Lambda 実装
├─ .github/workflows/
└─ README.md
```

---

## 3. データモデル（DynamoDB）

**テーブル `Notes`**

- PK: `userId` (STRING)
- SK: `noteId` (STRING, UUID)
- 属性:

  - `text` (STRING, 1〜1000 目安)
  - `tags` (LIST<STRING>, 0〜5 推奨)
  - `imageKey` (STRING, 任意, `s3://...` ではなく S3 Key)
  - `createdAt` (STRING, ISO8601)
  - `updatedAt` (STRING, ISO8601)

- GSI: `ByCreatedAt`

  - PK: `userId`, SK: `createdAt`

**設計のポイント**

- 初期の全文検索はクライアント側フィルタ。将来必要に応じて GSI や外部検索に拡張
- `imageKey` は **プリサインド URL** で PUT/GET

---

## 4. API 設計（HTTP API + Lambda）

**共通**

- 認可: `Authorization: Bearer <Cognito ID Token>`
- レスポンス: JSON

**エンドポイント**

- `POST /notes`

  - body: `{ text: string, tags: string[], imageKey?: string }`
  - res: `{ noteId: string }`

- `GET /notes?q?: string, tag?: string, limit?: number, cursor?: string`

  - DynamoDB GSI で `userId` の降順ページング、クライアントで `q`/`tag` を追加フィルタ
  - res: `{ items: Note[], nextCursor?: string }`

- `DELETE /notes/{id}`

  - res: `{ ok: true }`

- `POST /notes/{id}/presign`

  - body: `{ contentType: string }`
  - res: `{ url: string, key: string }` // `url` に PUT、`key` を `imageKey` に保存

**エラーハンドリング方針**

- 401 未認証、403 権限なし、400 不正入力、500 予期せぬエラー

---

## 5. 環境変数・シークレット

> いただいた `.env` の想定を尊重しつつ、**本番 CI/CD は OIDC を推奨**（長期キー非推奨）。

**.env（ローカル用途）**

```
# AWS
AWS_ACCOUNT_ID=
AWS_REGION=
AWS_ACCESS_KEY=
AWS_SECRET_ACCESS_KEY=

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GitHub
GITHUB_REPOSITORY=
```

**フロント（`frontend/.env.local`）**

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=<CDK出力のApiUrl>
NEXT_PUBLIC_USER_POOL_ID=<CDK出力>
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<CDK出力>
NEXT_PUBLIC_HOSTED_DOMAIN=<CDK出力のHostedDomain>
```

**Secrets Manager（CDK/CLI で作成）**

- 名前: `quicknotes/google-oauth`
- 値: `{ "clientId": "<GOOGLE_CLIENT_ID>", "clientSecret": "<GOOGLE_CLIENT_SECRET>" }`

---

## 6. 手順書（実践）

### Step 0. 前提セットアップ

- Node.js 20 / pnpm / AWS CLI v2 / CDK v2
- GitHub リポジトリ作成（例: `Ryo/quicknotes`）
- ローカル: AWS CLI のデフォルトプロファイル or `.env` をエクスポート

**チェックポイント (CP-0)**

- [ ] `aws sts get-caller-identity` が成功し、`AWS_ACCOUNT_ID` と一致
- [ ] `pnpm -v` / `node -v` が所定バージョン

---

### Step 1. GCP 側の準備（Google OAuth）

1. **GCP プロジェクト作成** → コンソールで選択
2. **OAuth 同意画面**

   - ユーザータイプ: 外部
   - アプリ情報入力（名称・ドメインは未設定で OK）
   - スコープ: `openid`, `email`, `profile`
   - テストユーザーに自分の Google アカウントを追加

3. **OAuth 2.0 クライアント ID（Web）** を作成

   - **承認済みのリダイレクト URI**: 後で Cognito ドメインが確定後に **`https://<domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse`** を追加
   - ひとまず空で作成 → 後で編集でも可

4. `client_id`, `client_secret` を控え、ローカル `.env` に記入

**チェックポイント (CP-1)**

- [ ] OAuth 同意画面が「テスト」状態で保存済
- [ ] OAuth クライアントの `client_id`/`client_secret` を取得済

---

### Step 2. CDK でインフラ作成

```bash
mkdir -p infra && cd infra
pnpm init -y
pnpm add -D aws-cdk ts-node typescript
pnpm add aws-cdk-lib constructs
npx cdk init app --language typescript
```

1. **Google シークレット登録（CLI）**

```bash
aws secretsmanager create-secret \
  --name quicknotes/google-oauth \
  --secret-string "{\"clientId\":\"$GOOGLE_CLIENT_ID\",\"clientSecret\":\"$GOOGLE_CLIENT_SECRET\"}" \
  --region $AWS_REGION
```

2. **スタック実装**（`lib/quicknotes-stack.ts`、`lambda/notes.ts` を配置）

   - Cognito UserPool + Domain（`quicknotes-<ACCOUNT_ID>`）
   - Google IdP（Secrets Manager を参照）
   - UserPool Client（Auth Code Flow, callback/logout は後で Amplify ドメインを追記）
   - DynamoDB `Notes` / GSI `ByCreatedAt`
   - S3 `images`（CORS は localhost & Amplify ドメイン）
   - Lambda(NodejsFunction) + API Gateway (HTTP API) + JWT Authorizer

3. **ブートストラップ & デプロイ**

```bash
npx cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
npx cdk deploy
```

4. **出力を控える**

- `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `HostedDomain`, `BucketName`

5. **GCP の OAuth クライアントにリダイレクト URI を追加**

- `https://<HostedDomain>/oauth2/idpresponse`

**チェックポイント (CP-2)**

- [ ] `HostedDomain` がブラウザで開け、`/login?response_type=code&client_id=...` へ誘導できる
- [ ] `ApiUrl` に未認証でアクセスすると 401

---

### Step 3. フロントエンド（Next.js + Amplify Auth）

```bash
cd ../
mkdir -p frontend && cd frontend
pnpm create next-app@latest . --ts --eslint --app --src-dir --tailwind --no-experimental-app
pnpm add aws-amplify @aws-amplify/ui-react
```

- `amplify/auth.ts` に Amplify v6 設定（Hosted UI / code flow）
- `app/layout.tsx` で `<Providers>` ラップ
- `Sign in with Google` / `Sign out` ボタンを設置
- API 呼び出しは `fetchAuthSession()` で ID Token を付与
- `.env.local` に `NEXT_PUBLIC_*` を設定（CDK 出力を反映）

**チェックポイント (CP-3)**

- [ ] `pnpm dev` → ログインフローが完了し、ユーザー情報が取得できる
- [ ] 401 が解消され、`GET /notes` が 200

---

### Step 4. 画像アップロード（プリサインド URL）

- `POST /notes/{id}/presign` に `contentType` を渡し、`url`/`key` を受領
- 返却された `url` に対して `PUT` でファイル本体をアップロード
- `imageKey` を `POST /notes` の body に含める or 更新で関連付け

**チェックポイント (CP-4)**

- [ ] 画像を S3 にアップロードできる（403/415 が出ない）
- [ ] 一覧カードでサムネイルが表示される（GET もプリサインド、または CloudFront/署名 URL）

---

### Step 5. Amplify Gen2（Hosting）

1. Amplify Console → **New app → Host web app** → GitHub 連携
2. Monorepo 設定で `frontend/` をルートに指定
3. 環境変数を設定：

   - `NEXT_PUBLIC_APP_URL`（Amplify ドメイン）
   - `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_USER_POOL_ID` / `NEXT_PUBLIC_USER_POOL_CLIENT_ID` / `NEXT_PUBLIC_HOSTED_DOMAIN`

4. デプロイ → 表示確認
5. Cognito UserPool Client の **Callback URLs / Logout URLs** に Amplify 本番 URL を追記（CDK 更新でも可）

**チェックポイント (CP-5)**

- [ ] 本番 URL でログイン → メモ作成・表示まで完了

---

### Step 6. GitHub Actions（CI & CDK デプロイ）

**チェック（Pull Request / develop, main）**

- `frontend` を `working-directory` に設定
- lint / typecheck / build を実行

**CDK デプロイ（main push）**

- **推奨**: GitHub → AWS OIDC 連携ロールを作成（長期キー不要）

  - トラストポリシー: `token.actions.githubusercontent.com`
  - 権限: `cdk bootstrap/deploy` 範囲（CloudFormation, S3, IAM, Lambda, APIGW, DynamoDB, Cognito, SecretsManager 等 最小権限）

- workflow 内で `aws-actions/configure-aws-credentials@v4` で AssumeRole

**チェックポイント (CP-6)**

- [ ] PR に Check が走り `build` まで成功
- [ ] main push で `cdk deploy` が成功

---

## 7. セキュリティ & 運用

- S3 は **Block Public Access**、オブジェクトアクセスは **プリサインド URL** のみ
- CORS は **localhost** と **Amplify ドメイン** のみに限定
- 機密情報（Google OAuth）は **Secrets Manager** に保管
- CI は OIDC（長期アクセスキーは避ける）
- DynamoDB は `userId` で完全分離、Lambda で sub クレームを必ず検証
- 最小権限の IAM（テーブル/bucket への限定権限）

---

## 8. テスト観点（最小）

- 認証：

  - 未ログイン 401、ログイン後 200
  - 別ユーザーで他人の `noteId` へアクセス不可

- 入力制御：テキスト長・タグ数・画像サイズ/拡張子
- 画像：PUT/GET ともに期限切れ URL は使用不可
- 耐障害：DynamoDB Throttle 時の `Retry-After` / 再試行（簡易）

---

## 9. 既知の決めごと / 制約

- ID Token を API の Authorizer に利用（Cognito User Pool JWT Authorizer）
- 検索は初期はクライアント側フィルタ（GSI 拡張は後続）
- `backend/` ディレクトリは作らない（Lambda は `infra/lambda/`）

---

## 10. 次の作業（このドキュメントに沿って実装）

1. CDK スタック（`lib/quicknotes-stack.ts`）と Lambda 雛形（`infra/lambda/notes.ts`）を追加
2. フロント（Amplify 設定、サインイン UI、一覧/作成/削除、画像アップロード処理）
3. GitHub Actions（Check / CDK Deploy）YAML を追加
4. Amplify Hosting 設定と Cognito Callback の最終整備

> この順でコードを書き出せば、手を動かしながら最短で“全部乗せ”を体験できます。
