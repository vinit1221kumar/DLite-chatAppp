import '@/styles/globals.css';
import { Providers } from './providers';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // Avoid browser “preloaded … was not used” on heavy routes; font still loads via className.
  preload: false,
});

export const metadata = {
  title: 'D-Lite',
  description: 'Chat • Groups • Calls',
  icons: {
    icon: [{ url: '/images/logo.png', type: 'image/png' }],
    apple: '/images/logo.png'
  }
};

const themeScript = `(function(){try{var k='d-lite-theme';var m=localStorage.getItem(k);var dark;if(m==='light')dark=false;else if(m==='dark')dark=true;else if(m==='system')dark=window.matchMedia('(prefers-color-scheme: dark)').matches;else dark=false;var r=document.documentElement;r.classList.toggle('dark',dark);r.style.colorScheme=dark?'dark':'light';var b=localStorage.getItem('d-lite-brand');r.classList.toggle('brand-warm',b==='warm');}catch(e){var r=document.documentElement;r.classList.remove('dark');r.style.colorScheme='light';}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`min-h-screen font-sans antialiased ${inter.className}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
