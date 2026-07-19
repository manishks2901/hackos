import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackOS",
  description: "The entire hackathon, inside your IDE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
