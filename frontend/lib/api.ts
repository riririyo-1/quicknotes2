import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

async function authFetch(path: string, init: RequestInit = {}) {
  const { tokens } = await fetchAuthSession();
  const jwt = tokens?.accessToken?.toString();
  if (!jwt) throw new Error("No access token");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(init.headers || {}),
    },
    // 明示（なくてもOK）
    mode: "cors",
  });

  // 失敗時に詳細を見たい
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  return res;
}

export function createNote(note: {
  text: string;
  tags: string[];
  imageKey?: string;
}) {
  return authFetch("/notes", { method: "POST", body: JSON.stringify(note) });
}
export function listNotes(params?: {
  q?: string;
  tag?: string;
  limit?: number;
  cursor?: string;
}) {
  const qs = params ? `?${new URLSearchParams(params as any).toString()}` : "";
  return authFetch(`/notes${qs}`, { method: "GET" });
}
export function deleteNote(id: string) {
  return authFetch(`/notes/${id}`, { method: "DELETE" });
}
export function presignUpload(noteId: string, contentType: string) {
  return authFetch(`/notes/${noteId}/presign`, {
    method: "POST",
    body: JSON.stringify({ contentType }),
  });
}
