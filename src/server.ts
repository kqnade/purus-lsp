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
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDiagnostics } from "./diagnostics";
import { formatDocument } from "./format";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentFormattingProvider: true,
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
