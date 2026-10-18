import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokéMart Commerce Terminal",
  description: "High-density, intentional PokéMart procurement terminal connected to public BFF.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
