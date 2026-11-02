// Converts the Adrift rulebook (.docx) into content/rules/adrift-rulebook.md, keeping headings, lists and tables.
// Rerun after editing the rulebook:
//   node scripts/import-rulebook.mjs "C:\Users\you\Downloads\Adrift.docx"

import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const src = process.argv[2];
const out = process.argv[3] ?? "content/rules/adrift-rulebook.md";
if (!src) {
  console.error('Usage: node scripts/import-rulebook.mjs "path/to/Adrift.docx" [output.md]');
  process.exit(1);
}

/** Read one file out of a zip (a .docx is a zip) using its central directory. */
function unzip(buf, name) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  let at = buf.readUInt32LE(end + 16);
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    if (buf.toString("utf8", at + 46, at + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    at += 46 + nameLen + extra + comment;
  }
  throw new Error(`${name} not found in ${src}`);
}

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

function text(xml) {
  let s = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>/g)) s += m[1] !== undefined ? decode(m[1]) : m[0] === "<w:tab/>" ? " " : "\n";
  return s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

const HEADING = { Title: 2, Heading1: 2, Heading2: 3, Heading3: 4, Heading4: 5 };

// The rulebook sometimes styles body text, list items, and lead-ins ("Choose one", "A mech gains") as
// headings. Real headings are short, unpunctuated, and end on a capitalized word or number.
const looksLikeHeading = (t) => t.length <= 70 && !/[.,;]$/.test(t) && !/\s[a-z][\w'’-]*:?$/.test(t);

function paragraph(p) {
  const full = text(p);
  if (!full) return "";
  const t = full.replace(/\n/g, " ");
  const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1];
  if (/<w:numPr>/.test(p)) return `- ${t}`;
  if (/^[•●▪◦]\s*/.test(t)) return `- ${t.replace(/^[•●▪◦]\s*/, "")}`;
  if (style && HEADING[style] && looksLikeHeading(t) && !/^Status:/.test(t)) return `${"#".repeat(HEADING[style])} ${t.replace(/:$/, "")}`;
  return full.replace(/\n/g, "\n\n");
}

function table(tbl) {
  // Some rows stack several lines in every cell; those are really several rows sharing one table row.
  const rows = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].flatMap((r) => {
    const cells = [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) => text(p[0]).replace(/\|/g, "/").replace(/\n/g, " ")).filter(Boolean));
    const k = cells[0]?.length ?? 0;
    if (cells.length > 1 && k > 1 && cells.every((c) => c.length === k)) return Array.from({ length: k }, (_, i) => cells.map((c) => c[i]));
    return [cells.map((c) => c.join(" ") || " ")];
  });
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r) => `| ${[...r, ...Array(width - r.length).fill(" ")].join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}

const xml = unzip(readFileSync(src), "word/document.xml");
const body = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
const blocks = [];
for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
  const block = m[0].startsWith("<w:tbl>") ? table(m[0]) : paragraph(m[0]);
  if (block) blocks.push(block);
}

// Keep consecutive list items together; separate everything else with a blank line.
let md = "";
for (const [i, b] of blocks.entries()) md += i === 0 ? b : b.startsWith("- ") && blocks[i - 1].startsWith("- ") ? `\n${b}` : `\n\n${b}`;
writeFileSync(out, `${md.trim()}\n`);
console.log(`Wrote ${out}: ${blocks.length} blocks, ${blocks.filter((b) => b.startsWith("#")).length} headings, ${blocks.filter((b) => b.startsWith("|")).length} tables.`);
