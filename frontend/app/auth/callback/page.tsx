"use client";
import { useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useRouter } from "next/navigation";

export default function Callback() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        await fetchAuthSession();
      } catch {}
      router.replace("/");
    })();
  }, [router]);
  return <p>Signing you in…</p>;
}
