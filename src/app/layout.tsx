import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_TC, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FocusModeProvider } from "@/components/FocusModeProvider";
import { HomeLayoutProvider } from "@/components/HomeLayoutProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerif = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  weight: ["400", "700", "900"],
  subsets: ["latin"],
});

const notoSans = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "はるまとぺーじ 檔案庫",
  description: "福嶋晴菜の「はるまとぺーじ」非公式節目內容檔案庫",
  // 個人存檔用途，不希望被搜尋引擎收錄
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" translate="no" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
              var appendDiv = function(msg) {
                var div = document.createElement('div');
                div.style.position = 'fixed';
                div.style.top = '0';
                div.style.left = '0';
                div.style.width = '100%';
                div.style.backgroundColor = 'rgba(200, 0, 0, 0.9)';
                div.style.color = 'white';
                div.style.zIndex = '999999';
                div.style.padding = '20px';
                div.style.fontSize = '12px';
                div.style.whiteSpace = 'pre-wrap';
                div.style.overflow = 'auto';
                div.style.maxHeight = '50vh';
                div.innerText = 'ERROR: ' + msg;

                var doAppend = function() {
                  if (document.body) {
                    document.body.appendChild(div);
                  } else {
                    document.documentElement.appendChild(div);
                  }
                };

                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', doAppend);
                } else {
                  doAppend();
                }
              };

              window.onerror = function(message, source, lineno, colno, error) {
                appendDiv('Global Error: ' + message + '\\n' + source + ':' + lineno + ':' + colno + '\\n' + (error && error.stack ? error.stack : ''));
                return false;
              };

              window.addEventListener('unhandledrejection', function(event) {
                appendDiv('Unhandled Promise Rejection: ' + (event.reason && event.reason.stack ? event.reason.stack : event.reason));
              });

              var originalConsoleError = console.error;
              console.error = function() {
                var args = Array.prototype.slice.call(arguments);
                var msg = args.map(function(a) { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }).join(' ');
                if (msg.indexOf('Hydration') !== -1 || msg.indexOf('Minified React error') !== -1) {
                  appendDiv(msg);
                }
                originalConsoleError.apply(console, args);
              };
            `,
            }}
          />
        )}
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} ${notoSans.variable} font-sans antialiased bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 min-h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <HomeLayoutProvider>
            <FocusModeProvider>
              <Header />
              <main className="min-h-screen">
                {children}
              </main>
              <Footer />
            </FocusModeProvider>
          </HomeLayoutProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
