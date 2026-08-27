import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "SustainGraph — MMKG-RAG Sustainability Analytics",
  description:
    "Knowledge Graph-Powered Multimodal RAG for Corporate Sustainability Report Analysis. " +
    "An analytical platform for structured sustainability intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <Sidebar />
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
