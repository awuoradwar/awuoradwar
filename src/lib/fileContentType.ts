import path from "node:path";

// application/octet-stream forces a silent download in most in-app browsers
// (including the standalone PWA's), which reads as a blank page since
// nothing ever renders -- the actual file type needs to be reported so the
// browser knows to display a PDF/image inline instead.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function contentTypeForFile(filename: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(filename).toLowerCase()] || "application/octet-stream";
}
