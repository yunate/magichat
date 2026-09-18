import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

markdown.validateLink = (url: string): boolean => {
  if (url.length === 0 || url.length > 2048 || url !== url.trim()) return false;
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:"
      && parsedUrl.username.length === 0
      && parsedUrl.password.length === 0;
  } catch {
    return false;
  }
};

export function renderSafeInlineMarkdown(source: string): string {
  return DOMPurify.sanitize(markdown.renderInline(source), {
    ALLOWED_TAGS: ["a", "strong", "em", "s", "code"],
    ALLOWED_ATTR: ["href", "title"],
  });
}