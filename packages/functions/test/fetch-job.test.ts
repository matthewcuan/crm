import { describe, expect, it } from "vitest";
import { htmlToText, sourceFromUrl } from "../src/api/fetch-job";

describe("htmlToText", () => {
  it("strips script/style and decodes entities into readable lines", () => {
    const html = `<html><head><style>.x{color:red}</style><script>var a=1;</script></head>
<body><h1>Senior Engineer</h1><p>Build &amp; ship things.</p><ul><li>C#/.NET</li><li>PKI</li></ul></body></html>`;
    expect(htmlToText(html)).toBe(
      "Senior Engineer\nBuild & ship things.\nC#/.NET\nPKI",
    );
  });

  it("drops noscript and svg blocks", () => {
    expect(
      htmlToText("<noscript>enable js</noscript><svg><path/></svg><p>Real</p>"),
    ).toBe("Real");
  });

  it("collapses whitespace runs", () => {
    expect(htmlToText("<p>a</p>   \n\n  <p>b</p>")).toBe("a\nb");
  });
});

describe("sourceFromUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/123", "greenhouse"],
    ["https://jobs.lever.co/acme/abc", "lever"],
    ["https://jobs.ashbyhq.com/acme/xyz", "ashby"],
    ["https://acme.wd5.myworkdayjobs.com/en-US/careers/job/1", "workday"],
    ["https://www.linkedin.com/jobs/view/123", "linkedin"],
    ["https://www.indeed.com/viewjob?jk=1", "indeed"],
    ["https://careers.example.com/job/1", "careers.example.com"],
  ])("%s → %s", (url, source) => {
    expect(sourceFromUrl(url)).toBe(source);
  });

  it("returns undefined for garbage", () => {
    expect(sourceFromUrl("not a url")).toBeUndefined();
  });
});
