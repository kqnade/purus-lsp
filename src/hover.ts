import { Hover, MarkupKind } from "vscode-languageserver/node";
import { Scope, findScopeAtPosition, lookupSymbol, SymbolKind } from "./symbols";
import { getKeywordInfo } from "./keywords";

export function getHoverInfo(
  rootScope: Scope,
  source: string,
  line: number,
  col: number
): Hover | null {
  const word = extractWordAtPosition(source, line, col);
  if (!word) return null;

  // Check keyword first
  const kwInfo = getKeywordInfo(word);
  if (kwInfo) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**\`${kwInfo.label}\`** — ${kwInfo.detail}\n\n${kwInfo.documentation}`,
      },
    };
  }

  // Look up user-defined symbol
  const scope = findScopeAtPosition(rootScope, line, col);
  const sym = lookupSymbol(scope, word);
  if (!sym) return null;

  let markdown = "";

  switch (sym.kind) {
    case SymbolKind.Function:
      markdown = `**fn** \`${sym.name}\``;
      if (sym.params && sym.params.length > 0) {
        const paramStr = sym.params.map((p) =>
          p.typeAnnotation ? `${p.name} of ${p.typeAnnotation}` : p.name
        ).join("; ");
        markdown += ` ${paramStr}`;
      }
      if (sym.returnType) {
        markdown += ` gives ${sym.returnType}`;
      }
      if (sym.isAsync) {
        markdown = `**async** ${markdown}`;
      }
      break;

    case SymbolKind.Variable:
      markdown = `**${sym.detail || `variable \`${sym.name}\``}**`;
      break;

    case SymbolKind.Parameter:
      markdown = `**(parameter)** \`${sym.name}\``;
      if (sym.detail) {
        markdown = `**${sym.detail}**`;
      }
      break;

    case SymbolKind.Class:
      markdown = `**${sym.detail || `class \`${sym.name}\``}**`;
      break;

    case SymbolKind.Method:
      markdown = `**${sym.detail || `method \`${sym.name}\``}**`;
      break;

    case SymbolKind.Property:
      markdown = `**${sym.detail || `property \`${sym.name}\``}**`;
      break;

    case SymbolKind.Namespace:
      markdown = `**namespace** \`${sym.name}\``;
      break;

    case SymbolKind.Import:
      markdown = `**${sym.detail || `import \`${sym.name}\``}**`;
      break;

    case SymbolKind.Type:
      markdown = `**${sym.detail || `type \`${sym.name}\``}**`;
      break;
  }

  if (!markdown) return null;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown,
    },
  };
}

function extractWordAtPosition(source: string, line: number, col: number): string | null {
  const lines = source.split("\n");
  if (line >= lines.length) return null;

  const lineText = lines[line];

  let start = col;
  while (start > 0 && /[a-zA-Z0-9_-]/.test(lineText[start - 1])) {
    start--;
  }

  let end = col;
  while (end < lineText.length && /[a-zA-Z0-9_-]/.test(lineText[end])) {
    end++;
  }

  const word = lineText.slice(start, end);
  if (!word || !/^[a-zA-Z_]/.test(word)) return null;

  return word;
}
