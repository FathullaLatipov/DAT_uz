import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { DialogProvider } from "@/components/ui/dialog";
import { getI18n } from "@/i18n/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "cyrillic"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return {
    title: { default: m.meta.siteTitle, template: "%s · Karvon" },
    description: m.meta.siteDescription,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    openGraph: { title: m.meta.ogTitle, type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#090c11" },
  ],
};

// Applies the saved/system theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale, m } = await getI18n();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}>
        <I18nProvider locale={locale} messages={m}>
          <DialogProvider>{children}</DialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
