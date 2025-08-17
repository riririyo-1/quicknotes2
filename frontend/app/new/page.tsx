"use client";
import { useEffect, useState } from "react";
import {
  getCurrentUser,
  fetchAuthSession,
  signInWithRedirect,
} from "aws-amplify/auth";
import { createNote, presignUpload } from "../../lib/api";
import { useRouter } from "next/navigation";

export default function NewNotePage() {
  const [user, setUser] = useState<any>(null);
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        await fetchAuthSession();
        const u = await getCurrentUser();
        setUser(u);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  if (!user) {
    return (
      <div>
        <p>ログインが必要です。</p>
        <button onClick={() => signInWithRedirect({ provider: "Google" })}>
          Sign in with Google
        </button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    let imageKey: string | undefined;
    // 先に空ノートを作らず、アップロード→note作成の順でもOK
    const noteTempId = crypto.randomUUID();
    if (file) {
      const pres = await presignUpload(noteTempId, file.type);
      const { url, key } = await pres.json();
      await fetch(url, { method: "PUT", body: file });
      imageKey = key;
    }

    const res = await createNote({
      text,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      imageKey,
    });
    if (res.ok) router.push("/");
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <h2>新規メモ</h2>
      <textarea
        placeholder="本文"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        required
      />
      <input
        placeholder="タグ（カンマ区切り）"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button type="submit">保存</button>
    </form>
  );
}
