import { Fragment, createElement } from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeVttEntities, renderWebVttCueText } from "./renderCueText";

function cueMarkup(text: string): string {
  const node = renderWebVttCueText(text);
  return renderToStaticMarkup(createElement(Fragment, null, node));
}

describe("decodeVttEntities", () => {
  test("decodes named and numeric entities", () => {
    expect(decodeVttEntities("a &amp; b &lt; c")).toBe("a & b < c");
    expect(decodeVttEntities("&#39;hi&#39;")).toBe("'hi'");
    expect(decodeVttEntities("&#x27;")).toBe("'");
  });
});

describe("renderWebVttCueText", () => {
  test("renders bold italic underline", () => {
    const html = cueMarkup("plain <b>bold</b> <i>it</i> <u>un</u>");
    expect(html).toContain("<strong>");
    expect(html).toContain("bold");
    expect(html).toContain("<em>");
    expect(html).toContain("<u>");
  });

  test("nests tags correctly", () => {
    const html = cueMarkup("x <b>bold <i>both</i> end</b>");
    expect(html).toMatch(/<strong>.*<em>both<\/em>.*<\/strong>/);
  });

  test("preserves newlines in text", () => {
    const html = cueMarkup("line1\nline2");
    expect(html).toContain("line1");
    expect(html).toContain("\n");
  });

  test("strips unknown tags", () => {
    const html = cueMarkup("a <c.red> b </c> c");
    expect(html).toBe("a  b  c");
  });

  test("returns null for empty string", () => {
    expect(renderWebVttCueText("")).toBeNull();
  });
});
