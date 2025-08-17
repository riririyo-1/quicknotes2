"use client";
import { useEffect, useState } from "react";
import {
  signInWithRedirect,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";
import { listNotes, deleteNote } from "../lib/api";
import Link from "next/link";

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");

  async function refresh() {
    const res = await listNotes({ q, tag });
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    (async () => {
      try {
        await fetchAuthSession();
        const u = await getCurrentUser();
        setUser(u);
        refresh();
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [q, tag]);

  if (!user) {
    return (
      <div style={{ textAlign: "center" }}>
        <h1>QuickNotes</h1>
        <p>短いメモ（タグ＋画像1枚）を保存/検索</p>
        <button onClick={() => signInWithRedirect({ provider: "Google" })}>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1 style={{ marginRight: "auto" }}>QuickNotes</h1>
        <Link href="/new">新規作成</Link>
        <button
          onClick={() => {
            signOut();
            setUser(null);
          }}
        >
          Sign out
        </button>
      </header>

      <section style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          placeholder="キーワード"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          placeholder="タグ"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </section>

      <ul style={{ display: "grid", gap: 12 }}>
        {items.map((n) => (
          <li key={n.noteId} style={{ border: "1px solid #ddd", padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{new Date(n.createdAt).toLocaleString()}</strong>
              <button
                onClick={async () => {
                  await deleteNote(n.noteId);
                  refresh();
                }}
              >
                削除
              </button>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{n.text}</p>
            {Array.isArray(n.tags) && n.tags.length > 0 && (
              <div>タグ: {n.tags.join(", ")}</div>
            )}
            {n.imageKey && (
              <div style={{ marginTop: 8 }}>
                {/* 画像表示は簡易化（直接キーを表示）。実運用はGETの署名URL生成APIを追加推奨 */}
                <em>imageKey: {n.imageKey}</em>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
