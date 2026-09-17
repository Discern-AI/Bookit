import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
export function accountMailReady() {
  return (
    (!!process.env.FOLIO_MAIL_WEBHOOK && !!process.env.FOLIO_MAIL_SECRET) ||
    localOutbox()
  );
}
function localOutbox() {
  return (
    process.env.FOLIO_MAIL_MODE === "local" &&
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.NEXTAUTH_URL || "http://localhost:3000").hostname,
    )
  );
}
export async function sendAccountMail(
  to: string,
  link: string,
  action: string,
) {
  const message = {
    to,
    subject:
      action === "reset"
        ? "Reset your Folio password"
        : "Confirm your Folio email change",
    text: `Open this link to ${action === "reset" ? "reset your password" : "confirm your new email address"}: ${link}\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this message.`,
  };
  if (localOutbox()) {
    const directory = path.join(process.cwd(), ".local", "mail");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, `${randomUUID()}.json`),
      JSON.stringify(message),
      { flag: "wx", mode: 0o600 },
    );
    return;
  }
  if (!process.env.FOLIO_MAIL_WEBHOOK || !process.env.FOLIO_MAIL_SECRET)
    throw new Error("Mail unavailable");
  const endpoint = new URL(process.env.FOLIO_MAIL_WEBHOOK);
  if (endpoint.protocol !== "https:")
    throw new Error("Mail endpoint requires HTTPS");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FOLIO_MAIL_SECRET}`,
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Mail unavailable");
}
