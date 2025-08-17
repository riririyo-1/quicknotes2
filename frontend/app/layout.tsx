import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "QuickNotes",
  description: "Minimal notes app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Providers>
          <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px" }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
