import type { SVGProps } from "react";

/**
 * Icon set — shared shape language with the admin dashboard.
 *
 * Hand-rolled rather than pulling in an icon package: the shop needs about
 * twenty glyphs, and a dependency would ship a few thousand. Every icon here is
 * a 24×24 stroke path on the same grid with the same 1.75 stroke width, so they
 * sit together without one looking heavier than its neighbours.
 *
 * All are `aria-hidden` by default — an icon beside a text label is decoration,
 * and announcing it twice is worse than not announcing it at all. Pass a
 * `title` for the rare icon-only control.
 */

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...props}
      className={`shrink-0 ${props.className ?? "h-[18px] w-[18px]"}`}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export const Icon = {
  Dashboard: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  ),
  Orders: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </Svg>
  ),
  Products: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
    </Svg>
  ),
  Stock: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
      <path d="M3 20h18" />
    </Svg>
  ),
  Promotions: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20.6 12.4 12.4 20.6a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1-.6-1.5l.3-6.1A2 2 0 0 1 5 4.9l6.1-.3a2 2 0 0 1 1.5.6l6.2 6.2a2 2 0 0 1 0 2.8z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </Svg>
  ),
  Customers: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 6" />
      <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </Svg>
  ),
  Sms: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </Svg>
  ),
  Delivery: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18.5" r="1.8" />
      <circle cx="17" cy="18.5" r="1.8" />
    </Svg>
  ),
  Staff: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  ),
  Blog: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 13h7M8.5 17h5" />
    </Svg>
  ),
  Faq: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.9.7-.9 1.3v.4" />
      <path d="M12 17h.01" />
    </Svg>
  ),
  Settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19l-.1.1A2 2 0 1 1 5 16.3l.1-.1A1.6 1.6 0 0 0 4 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 7.9L4.9 7.8A2 2 0 1 1 7.7 5l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1A2 2 0 1 1 20.1 7l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.2z" />
    </Svg>
  ),

  // --- actions ---
  Plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Edit: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </Svg>
  ),
  Trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  ),
  Copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
    </Svg>
  ),
  Search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  Download: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </Svg>
  ),
  Check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  ),
  Close: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Menu: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  ),
  ChevronUp: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  ),
  ChevronDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  ),
  Image: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 2.5-2.5L20 17" />
    </Svg>
  ),
  Link: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0L5.5 13.3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </Svg>
  ),
  Money: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </Svg>
  ),
  Alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4 2.5 20h19L12 4z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  Logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
      <path d="M17 15l4-3-4-3" />
      <path d="M21 12H10" />
    </Svg>
  ),
  Cart: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.8a1.5 1.5 0 0 0 1.5-1.2L20 8H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </Svg>
  ),
  User: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  ),
  Whatsapp: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 11.8a8.7 8.7 0 0 1-12.7 7.7L3 21l1.6-5.1A8.7 8.7 0 1 1 21 11.8z" />
      <path d="M8.9 8.4c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.5l.7 1.6c.1.2 0 .4-.1.6l-.4.5c-.1.2-.3.3-.1.6a6 6 0 0 0 2.9 2.5c.3.1.5 0 .6-.1l.6-.7c.2-.2.3-.2.6-.1l1.6.8c.3.1.4.2.4.4a1.9 1.9 0 0 1-1.3 1.6 3.4 3.4 0 0 1-2.6-.3 10 10 0 0 1-4.6-4.6 3.6 3.6 0 0 1 .5-2.9z" />
    </Svg>
  ),
  ArrowRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </Svg>
  ),
  Shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  Leaf: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 19c0-8 5-13 14-13 0 9-5 13-11 13H5z" />
      <path d="M5 19c3-4 6-6 10-7.5" />
    </Svg>
  ),
  Package: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </Svg>
  ),
  Trend: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
