import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayMap — AI customer data onboarding",
  description:
    "A portfolio-ready agentic data onboarding platform built with LangGraph, DuckDB and MongoDB Atlas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
