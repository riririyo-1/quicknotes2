"use client";
import { useEffect } from "react";
import { Amplify } from "aws-amplify";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const domain = (process.env.NEXT_PUBLIC_HOSTED_DOMAIN || "").replace(
      "https://",
      ""
    );
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
          userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
          loginWith: {
            oauth: {
              domain,
              scopes: ["openid", "email", "profile"],
              redirectSignIn: [`${appUrl}/auth/callback`], // 配列で指定
              redirectSignOut: [appUrl],
              responseType: "code",
            },
          },
        },
      },
    });
  }, []);
  return <>{children}</>;
}
