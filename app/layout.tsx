import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "OSM Tournaments — прототип",
  description: "Таблицы и календари лиг Online Soccer Manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-black text-white">
        <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 font-bold text-lg">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-600 to-amber-500 text-black">
                OSM
              </span>
              Tournaments
            </Link>
            <nav className="flex items-center gap-6 text-sm text-gray-300">
              <Link href="/" className="hover:text-white">Лиги</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/10 text-center text-xs text-gray-500 py-6">
          Прототип · данные из Online Soccer Manager
        </footer>
      </body>
    </html>
  );
}
