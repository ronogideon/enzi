import Script from "next/script";

/**
 * Analytics, loaded only when an ID is configured.
 *
 * Two deliberate choices:
 *
 *  - Nothing loads at all when the ID is blank. Shipping an empty tracking tag
 *    costs every visitor a request and a cookie consent question for no data.
 *  - `afterInteractive` rather than `beforeInteractive`, so the tracker never
 *    sits on the critical path. Analytics should never be the reason a product
 *    page is slow to become usable — which also protects the Core Web Vitals
 *    that search ranking actually reads.
 */
export function Analytics({
  gaId,
  metaPixelId,
}: {
  gaId?: string;
  metaPixelId?: string;
}) {
  return (
    <>
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
            s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
    </>
  );
}
