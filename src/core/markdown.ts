import { remark } from "remark";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";

export type ExtractedMarkdownElement =
  | ExtractedMarkdownCode
  | ExtractedMarkdownHeading
  | ExtractedMarkdownInlineCode
  | ExtractedMarkdownLink;

export interface MarkdownSourceLocation {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface ExtractedMarkdownCode {
  type: "code";
  value: string;
  lang?: string;
  meta?: string;
  location: MarkdownSourceLocation;
}

export interface ExtractedMarkdownHeading {
  type: "heading";
  depth: number;
  text: string;
  location: MarkdownSourceLocation;
}

export interface ExtractedMarkdownInlineCode {
  type: "inlineCode";
  value: string;
  location: MarkdownSourceLocation;
}

export interface ExtractedMarkdownLink {
  type: "link";
  text: string;
  url: string;
  title?: string;
  location: MarkdownSourceLocation;
}

interface PositionedNode {
  type: string;
  position?: {
    start: {
      line: number;
      column: number;
    };
    end: {
      line: number;
      column: number;
    };
  };
}

interface CodeNode extends PositionedNode {
  type: "code";
  value: string;
  lang?: string | null;
  meta?: string | null;
}

interface HeadingNode extends PositionedNode {
  type: "heading";
  depth: number;
  children?: MarkdownChildNode[];
}

interface InlineCodeNode extends PositionedNode {
  type: "inlineCode";
  value: string;
}

interface LinkNode extends PositionedNode {
  type: "link";
  url: string;
  title?: string | null;
  children?: MarkdownChildNode[];
}

interface TextNode extends PositionedNode {
  type: "text";
  value: string;
}

interface ParentNode extends PositionedNode {
  children?: MarkdownChildNode[];
}

type MarkdownChildNode = InlineCodeNode | LinkNode | ParentNode | TextNode | PositionedNode;

export function extractMarkdownElements(content: string): ExtractedMarkdownElement[] {
  const tree = remark().use(remarkParse).parse(content);
  const elements: ExtractedMarkdownElement[] = [];

  visit(tree, (node: PositionedNode) => {
    if (node.type === "heading") {
      const heading = node as HeadingNode;
      elements.push({
        type: "heading",
        depth: heading.depth,
        text: extractPlainText(heading),
        location: getLocation(heading)
      });
      return;
    }

    if (node.type === "inlineCode") {
      const inlineCode = node as InlineCodeNode;
      elements.push({
        type: "inlineCode",
        value: inlineCode.value,
        location: getLocation(inlineCode)
      });
      return;
    }

    if (node.type === "code") {
      const code = node as CodeNode;
      elements.push({
        type: "code",
        value: code.value,
        ...(code.lang ? { lang: code.lang } : {}),
        ...(code.meta ? { meta: code.meta } : {}),
        location: getLocation(code)
      });
      return;
    }

    if (node.type === "link") {
      const link = node as LinkNode;
      elements.push({
        type: "link",
        text: extractPlainText(link),
        url: link.url,
        ...(link.title ? { title: link.title } : {}),
        location: getLocation(link)
      });
    }
  });

  return elements;
}

function extractPlainText(node: ParentNode): string {
  return (node.children ?? []).map(extractChildText).join("");
}

function extractChildText(node: MarkdownChildNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return (node as TextNode | InlineCodeNode).value;
  }

  return extractPlainText(node as ParentNode);
}

function getLocation(node: PositionedNode): MarkdownSourceLocation {
  if (!node.position) {
    throw new Error(`Expected markdown ${node.type} node to include source position.`);
  }

  return {
    line: node.position.start.line,
    column: node.position.start.column,
    endLine: node.position.end.line,
    endColumn: node.position.end.column
  };
}
