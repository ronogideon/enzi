import { button, esc, firstName, h1, layout, lead, small } from "./layout";
import type { RenderedEmail } from "./layout";

export function passwordResetEmail(opts: {
  name: string | null;
  url: string;
  minutes: number;
  staff: boolean;
  smsSent: boolean;
}): RenderedEmail {
  const where = opts.staff ? "your Enzi Packaging staff account" : "your Enzi Packaging account";
  const html = layout({
    preheader: `Reset link for ${where}. Expires in ${opts.minutes} minutes.`,
    body: `${h1("Reset your password")}
${lead(`Hi ${esc(firstName(opts.name))}, we got a request to reset the password for ${where}. This link expires in ${opts.minutes} minutes and can only be used once.`)}
${button(opts.url, "Choose a new password")}
${opts.smsSent ? small("We also sent a 6-digit code to your phone — you can use either one.") : ""}
${small(`Didn't ask for this? You can ignore this email; your password won't change.<br><br>Button not working? Paste this link into your browser:<br><span style="word-break:break-all;">${esc(opts.url)}</span>`)}`,
    footer: opts.staff ? "Enzi Packaging · Staff account" : undefined,
  });

  const text = `Reset your password

Hi ${firstName(opts.name)}, we got a request to reset the password for ${where}.

Choose a new password (expires in ${opts.minutes} minutes):
${opts.url}
${opts.smsSent ? "\nWe also sent a 6-digit code to your phone — you can use either one.\n" : ""}
Didn't ask for this? Ignore this email; your password won't change.`;

  return { subject: "Reset your Enzi Packaging password", html, text };
}

export function passwordChangedEmail(opts: { name: string | null; staff: boolean; when: string }): RenderedEmail {
  const html = layout({
    preheader: "Your password was just changed.",
    body: `${h1("Your password was changed")}
${lead(`Hi ${esc(firstName(opts.name))}, the password for your ${opts.staff ? "staff " : ""}account was changed on ${esc(opts.when)}. You've been signed out on other devices.`)}
${small("If this wasn't you, reply to this email right away so we can secure your account.")}`,
    footer: opts.staff ? "Enzi Packaging · Staff account" : undefined,
  });
  const text = `Your password was changed on ${opts.when}. You've been signed out on other devices.\n\nIf this wasn't you, reply to this email right away.`;
  return { subject: "Your Enzi Packaging password was changed", html, text };
}
