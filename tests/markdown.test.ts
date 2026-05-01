import { describe, expect, it } from "vitest";
import { extractMarkdownElements } from "../src/core/markdown.js";

describe("extractMarkdownElements", () => {
  it("extracts headings, fenced code blocks, and inline code with source locations", () => {
    const markdown = [
      "# Project Instructions",
      "",
      "Run `npm run test` before pushing and `npm run build` in CI.",
      "",
      "## Safety",
      "",
      "Do not execute `rm -rf dist` from [docs](docs/safety.md).",
      "",
      "```bash",
      "npm run test",
      "npm run build",
      "```",
      "",
      "Plain text npm run ignored should not create an extracted element."
    ].join("\n");

    expect(extractMarkdownElements(markdown)).toEqual([
      {
        type: "heading",
        depth: 1,
        text: "Project Instructions",
        location: {
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 23
        }
      },
      {
        type: "inlineCode",
        value: "npm run test",
        location: {
          line: 3,
          column: 5,
          endLine: 3,
          endColumn: 19
        }
      },
      {
        type: "inlineCode",
        value: "npm run build",
        location: {
          line: 3,
          column: 39,
          endLine: 3,
          endColumn: 54
        }
      },
      {
        type: "heading",
        depth: 2,
        text: "Safety",
        location: {
          line: 5,
          column: 1,
          endLine: 5,
          endColumn: 10
        }
      },
      {
        type: "inlineCode",
        value: "rm -rf dist",
        location: {
          line: 7,
          column: 16,
          endLine: 7,
          endColumn: 29
        }
      },
      {
        type: "link",
        text: "docs",
        url: "docs/safety.md",
        location: {
          line: 7,
          column: 35,
          endLine: 7,
          endColumn: 57
        }
      },
      {
        type: "code",
        value: "npm run test\nnpm run build",
        lang: "bash",
        location: {
          line: 9,
          column: 1,
          endLine: 12,
          endColumn: 4
        }
      }
    ]);
  });

  it("keeps LF and CRLF source lines equivalent", () => {
    const lfMarkdown = "## Setup\n\nUse `npm test`.\n";
    const crlfMarkdown = lfMarkdown.replace(/\n/g, "\r\n");

    expect(extractMarkdownElements(crlfMarkdown)).toEqual(extractMarkdownElements(lfMarkdown));
  });
});
