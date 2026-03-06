#!/usr/bin/env node

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DocumentFormattingParams,
  TextEdit,
  CompletionParams,
  CompletionItem,
  HoverParams,
  Hover,
  MarkupKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDiagnostics } from "./diagnostics";
import { formatDocument } from "./format";
import { getCompletionItems, getKeywordInfo } from "./keywords";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentFormattingProvider: true,
      completionProvider: {
        resolveProvider: false,
      },
      hoverProvider: true,
    },
  };
});

// Validate on open and change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

async function validateDocument(document: TextDocument): Promise<void> {
  const diagnostics = getDiagnostics(document.getText());
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Completion
connection.onCompletion(
  (_params: CompletionParams): CompletionItem[] => {
    return getCompletionItems();
  }
);

// Hover
connection.onHover((params: HoverParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Extract the word at cursor position (Purus identifiers support hyphens)
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  const matchBefore = before.match(/[a-zA-Z0-9-]*$/);
  const matchAfter = after.match(/^[a-zA-Z0-9-]*/);
  const word = (matchBefore?.[0] ?? "") + (matchAfter?.[0] ?? "");

  if (!word) return null;

  const info = getKeywordInfo(word);
  if (!info) return null;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**\`${info.label}\`** — ${info.detail}\n\n${info.documentation}`,
    },
  };
});

// Format
connection.onDocumentFormatting(
  async (params: DocumentFormattingParams): Promise<TextEdit[]> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    try {
      return await formatDocument(document);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      connection.console.error(`Format error: ${message}`);
      return [];
    }
  }
);

documents.listen(connection);
connection.listen();
