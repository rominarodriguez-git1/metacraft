import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metacraft",
  description: "Renovation quote aggregator",
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
