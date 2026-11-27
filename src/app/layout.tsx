import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Mono, Manrope, Syne } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RitualPot — a group stake that pays the people who kept their ritual",
  description:
    "Everyone stakes the same amount, validators judge one proof page per period against a goal fixed up front, and the contract splits the money.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${syne.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
