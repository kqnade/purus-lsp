import { Location, Position, Range } from "vscode-languageserver/node";
import { Scope, findScopeAtPosition, lookupSymbol } from "./symbols";
import { Span } from "./token";

export function getReferences(
  rootScope: Scope,
  uri: string,
  line: number,
  col: number,
  source: string,
  includeDeclaration: boolean
): Location[] {
  const word = extractWordAtPosition(source, line, col);
  if (!word) return [];

  const scope = findScopeAtPosition(rootScope, line, col);
  const sym = lookupSymbol(scope, word);
  if (!sym) return [];

  const locations: Location[] = [];

  if (includeDeclaration) {
    locations.push({ uri, range: spanToRange(sym.nameSpan) });
  }

  for (const ref of sym.references) {
    locations.push({ uri, range: spanToRange(ref) });
  }

  return locations;
}

function extractWordAtPosition(source: string, line: number, col: number): string | null {
  const lines = source.split("\n");
  if (line >= lines.length) return null;

  const lineText = lines[line];
  if (col >= lineText.length) return null;

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

function spanToRange(span: Span): Range {
  return Range.create(
    Position.create(span.start.line, span.start.column),
    Position.create(span.end.line, span.end.column)
  );
}
