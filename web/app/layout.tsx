import './globals.css';
import { AppProviders } from './providers';

const LIGHT_LOCK_JS = `(function () {
  try {
    var p = location.pathname;
    var slash = '/';
    var fris = slash + 'fris';
    var dashboard = fris + slash + 'dashboard';
    var others = slash + 'others';
    var login = slash + 'login';
    var lock =
      (p.indexOf(fris) === 0 && p.indexOf(dashboard) !== 0) ||
      p.indexOf(others) === 0 ||
      p === login;
    if (lock) {
      var root = document.documentElement;
      root.setAttribute('data-fris-light-lock', '');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Native script: next/script beforeInteractive warns under React 19 client render. */}
        <script
          id="fris-light-lock-init"
          dangerouslySetInnerHTML={{ __html: LIGHT_LOCK_JS }}
        />
      </head>
      <body className="antialiased font-sans" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
