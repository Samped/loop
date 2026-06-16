function inline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="doc-link">$1</a>');
}

export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let inTable = false;
  let tableRows: string[] = [];
  let inList = false;

  const flushTable = () => {
    if (!tableRows.length) return;
    out.push('<table class="doc-table">');
    for (let i = 0; i < tableRows.length; i++) {
      const cells = tableRows[i]
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      const tag = i === 0 ? "th" : "td";
      out.push(
        `<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`
      );
    }
    out.push("</table>");
    tableRows = [];
    inTable = false;
  };

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      if (inTable) flushTable();
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        out.push('<pre class="doc-pre"><code>');
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      out.push(
        line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
      );
      continue;
    }

    if (line.includes("|") && line.trim().startsWith("|")) {
      closeList();
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;
      if (!inTable) inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3 class="doc-h3">${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2 class="doc-h2">${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1 class="doc-h1">${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push('<ul class="doc-ul">');
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(line)) {
      closeList();
      out.push(`<p class="doc-p">${inline(line)}</p>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p class="doc-p">${inline(line)}</p>`);
    }
  }

  closeList();
  if (inTable) flushTable();
  if (inCode) out.push("</code></pre>");

  return out.join("\n");
}
