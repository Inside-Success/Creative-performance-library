import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creative Performance Library",
  description: "Inside Success TV internal creative performance dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
