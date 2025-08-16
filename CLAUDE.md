# 開発者向け実装ガイドライン

## 実装ルール

- 関数同士は 2 行空けること
- コメントは日本語で記載
- 関数やブロック毎のコメントは、その前に "# -- コメント --------------"のように可読性高く記載
- ''' を使ったコメントは記載しないこと
- ハードコーディングは禁止
- クリーンな実装を常に心がけること

## Next.js 開発ルール

- App Router を使用（Pages Router は使用しない）
- TypeScript 必須
- pnpm をパッケージマネージャーとして使用
- `frontend/src/app`にページ、`frontend/src/components`にコンポーネント配置
- Server Components と Client Components を適切に使い分け
- 環境変数は`.env`で管理

## Amplify Gen 2 実装ルール

- `amplify/backend.ts`でリソース定義
- TypeScript でバックエンド設定
- defineBackend() でリソース組み立て
- 環境毎の設定は amplify/environments/ で管理
- npx amplify sandbox でローカル開発

## セキュリティルール

- AWS 認証情報をコードに含めない
- 環境変数で機密情報管理（.env.local、GitHub Secrets）
- HTTPS 通信強制
- 入力値検証必須（zod 等のスキーマバリデーション）
- Amplify Auth での認証状態管理

## WSL ファイルパス変換ルール

Windows パスを ubuntu のマウントディレクトリパスに変換：
`C:\Users\user1\Pictures\image.jpg` → `/mnt/c/user1/Pictures/image.jpg`
