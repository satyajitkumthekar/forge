// Note: we deliberately do NOT use expo-router's ScrollViewStyleReset.
// It pins html/body/#root to `height: 100%`, which resolves against the
// viewport as measured at first layout — during PWA launch that measurement
// is short (status bar/insets still settling), leaving the tab bar floating
// above the bottom until a navigation forces re-layout. `100dvh` tracks the
// live viewport natively. viewportFrame below replicates the rest of the reset.

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        {/* Self-hosted Inter (no external font requests) */}
        <link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />

        {/* PWA Configuration */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FAF9F6" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon-180.png" />

        {/* iOS PWA Support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Superhuman Lab" />

        {/* Android PWA Support */}
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Viewport frame + body-scroll disable (replaces ScrollViewStyleReset — see note at top) */}
        <style dangerouslySetInnerHTML={{ __html: viewportFrame }} />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

// Light-only app: keep the eggshell base even on dark-mode devices so the
// launch never flashes black
const responsiveBackground = `
body {
  background-color: #FAF9F6;
}`;

// The app frame. 100dvh = dynamic viewport height: the browser keeps it in
// sync as UI chrome/insets settle, so the tab bar can never be stranded by a
// stale first-layout measurement. 100% fallback for pre-dvh browsers.
const viewportFrame = `
html, body, #root {
  height: 100%;
}
@supports (height: 100dvh) {
  html, body, #root {
    height: 100dvh;
  }
}
body {
  overflow: hidden;
}
#root {
  display: flex;
}`;
