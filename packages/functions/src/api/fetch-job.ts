const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Crude but dependency-free HTML → readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Best-effort job source from the URL host. */
export function sourceFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    if (host.includes("greenhouse")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq")) return "ashby";
    if (host.includes("workday")) return "workday";
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("indeed")) return "indeed";
    return host.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Fetch a job posting page. ATS pages (Greenhouse/Lever/Ashby) work well;
 *  JS/auth-walled pages (LinkedIn, Indeed) come back `blocked` and the UI
 *  falls back to "paste the description text". */
export async function fetchJobPage(
  url: string,
): Promise<{ text: string } | { blocked: true; reason: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { blocked: true, reason: "Could not reach the page." };
  }
  if (!res.ok) {
    return { blocked: true, reason: `Page returned HTTP ${res.status}.` };
  }
  const text = htmlToText(await res.text());
  if (text.length < 400) {
    return {
      blocked: true,
      reason:
        "Page had too little readable text (it likely requires JavaScript or a login).",
    };
  }
  return { text: text.slice(0, 40_000) };
}
