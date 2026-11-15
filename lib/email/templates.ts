export type EmailItem = { name: string; quantity: number; total: number };
export type EmailRow = [label: string, value: string];

export type EmailSection = {
  heading?: string;
  paragraphs?: string[];
  rows?: EmailRow[];
  items?: EmailItem[];
};

export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

export type RenderEmailInput = {
  subject: string;
  heading: string;
  intro?: string;
  sections?: EmailSection[];
  cta?: { label: string; url: string };
  note?: string;
  currency?: string;
  unsubscribeUrl?: string;
};

const BRAND = "#ea580c";
const BRAND_DARK = "#7c2d12";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#fed7aa";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function renderItems(items: EmailItem[], currency: string): string {
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">${item.quantity} × ${escapeHtml(item.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;">${currency} ${item.total.toFixed(2)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:${INK};">${rows}</table>`;
}

function renderRows(rows: EmailRow[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:${INK};">
    ${rows
      .map(
        ([label, value]) => `<tr>
          <td style="padding:6px 0;color:${MUTED};width:48%;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
        </tr>`,
      )
      .join("")}
  </table>`;
}

function renderSection(section: EmailSection, currency: string): string {
  const parts: string[] = [];
  if (section.heading) {
    parts.push(`<h2 style="margin:24px 0 8px;font-size:16px;color:${INK};">${escapeHtml(section.heading)}</h2>`);
  }
  for (const paragraph of section.paragraphs ?? []) {
    parts.push(`<p style="margin:0 0 10px;font-size:14px;line-height:22px;color:#334155;">${escapeHtml(paragraph)}</p>`);
  }
  if (section.items?.length) parts.push(renderItems(section.items, currency));
  if (section.rows?.length) parts.push(renderRows(section.rows));
  return parts.join("");
}

function textSection(section: EmailSection, currency: string): string {
  const lines: string[] = [];
  if (section.heading) lines.push(section.heading.toUpperCase());
  for (const paragraph of section.paragraphs ?? []) lines.push(paragraph);
  for (const [label, value] of section.rows ?? []) lines.push(`${label}: ${value}`);
  for (const item of section.items ?? []) lines.push(`${item.quantity} x ${item.name} (${currency} ${item.total.toFixed(2)})`);
  return lines.join("\n");
}

export function renderEmail(input: RenderEmailInput): EmailContent {
  const currency = input.currency ?? "GHS";
  const sections = input.sections ?? [];
  const cta = input.cta
    ? `<p style="margin:26px 0 8px;"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 24px;border-radius:999px;">${escapeHtml(input.cta.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#fff7ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:20px;overflow:hidden;">
          <tr><td style="background:${BRAND_DARK};padding:20px 28px;">
            <span style="display:inline-block;background:${BRAND};color:#fff;font-weight:800;font-size:13px;letter-spacing:1px;padding:6px 12px;border-radius:999px;">EATRY HUB</span>
            <p style="margin:10px 0 0;color:#ffedd5;font-size:12px;">Ghana's table, delivered.</p>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 6px;font-size:22px;line-height:30px;color:${INK};">${escapeHtml(input.heading)}</h1>
            ${input.intro ? `<p style="margin:0 0 10px;font-size:14px;line-height:22px;color:#334155;">${escapeHtml(input.intro)}</p>` : ""}
            ${sections.map((section) => renderSection(section, currency)).join("")}
            ${cta}
            ${input.note ? `<p style="margin:22px 0 0;font-size:12px;line-height:19px;color:${MUTED};">${escapeHtml(input.note)}</p>` : ""}
          </td></tr>
          <tr><td style="padding:18px 28px;background:#fffbeb;border-top:1px solid ${LINE};">
            <p style="margin:0;font-size:12px;line-height:19px;color:${MUTED};">
              Eatry Hub · support@eatryhub.com<br>
              This is an automated message. Do not reply to it.
              ${input.unsubscribeUrl ? `<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${BRAND};">Unsubscribe from marketing emails</a>` : ""}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    "EATRY HUB",
    input.heading,
    input.intro ?? "",
    ...sections.map((section) => textSection(section, currency)),
    input.cta ? `${input.cta.label}: ${input.cta.url}` : "",
    input.note ?? "",
    "Eatry Hub · support@eatryhub.com",
    input.unsubscribeUrl ? `Unsubscribe: ${input.unsubscribeUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n\n");

  return { subject: input.subject, text, html };
}

export type OrderEmailInput = {
  brand: "customer" | "vendor" | "admin";
  heading: string;
  intro?: string;
  orderNumber: string;
  customerName: string;
  items: EmailItem[];
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  note?: string;
};

export function renderOrderEmail(input: OrderEmailInput): EmailContent {
  const currency = "GHS";
  const rows: EmailRow[] = [
    ["Order number", input.orderNumber],
    ["Customer", input.customerName],
  ];
  if (input.status) rows.push(["Status", input.status.replaceAll("_", " ")]);
  if (input.paymentMethod) rows.push(["Payment method", input.paymentMethod.replaceAll("_", " ")]);
  if (input.paymentStatus) rows.push(["Payment status", input.paymentStatus.replaceAll("_", " ")]);

  return renderEmail({
    subject: `${input.heading} · ${input.orderNumber}`,
    heading: input.heading,
    intro: input.intro,
    currency,
    sections: [
      { rows },
      ...(input.items.length > 0 ? [{ heading: "Items ordered", items: input.items }] : []),
      {
        heading: "Payment summary",
        rows: [
          ...(input.subtotal === undefined ? [] : ([["Food subtotal", `${currency} ${input.subtotal.toFixed(2)}`]] as EmailRow[])),
          ...(input.deliveryFee === undefined ? [] : ([["Delivery fee", `${currency} ${input.deliveryFee.toFixed(2)}`]] as EmailRow[])),
          ...(input.total === undefined ? [] : ([["Total", `${currency} ${input.total.toFixed(2)}`]] as EmailRow[])),
        ],
      },
    ],
    cta: input.ctaUrl ? { label: input.ctaLabel ?? "View order", url: input.ctaUrl } : undefined,
    note: input.note,
  });
}

export function renderSimpleEmail(input: {
  subject: string;
  heading: string;
  intro?: string;
  paragraphs?: string[];
  rows?: EmailRow[];
  cta?: { label: string; url: string };
  note?: string;
  unsubscribeUrl?: string;
}): EmailContent {
  return renderEmail({
    subject: input.subject,
    heading: input.heading,
    intro: input.intro,
    sections: [
      ...(input.paragraphs ? [{ paragraphs: input.paragraphs }] : []),
      ...(input.rows ? [{ rows: input.rows }] : []),
    ],
    cta: input.cta,
    note: input.note,
    unsubscribeUrl: input.unsubscribeUrl,
  });
}