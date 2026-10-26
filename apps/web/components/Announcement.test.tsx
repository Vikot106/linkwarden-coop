import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Announcement from "./Announcement";

describe("configured footer announcement", () => {
  it("inserts the custom link into the message", () => {
    const html = renderToStaticMarkup(
      <Announcement
        announcement={{
          id: "welcome-1",
          message: "欢迎使用，查看 {link}。",
          linkText: "使用说明",
          linkUrl: "https://example.com/help",
        }}
        dismissAnnouncement={() => {}}
      />
    );
    expect(html).toContain('href="https://example.com/help"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("使用说明</a>。");
    expect(html).not.toContain("{link}");
  });

  it("renders custom content as text and allows an announcement without a link", () => {
    const html = renderToStaticMarkup(
      <Announcement
        announcement={{
          id: "notice-1",
          message: "<script>alert(1)</script>",
          linkText: "unused",
          linkUrl: null,
        }}
        dismissAnnouncement={() => {}}
      />
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("unused");
  });
});
