import { Token, TokenKind, Position, Span, KEYWORDS } from "./token";

export function tokenize(source: string): Token[] {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 0;
  private col: number = 0;
  private tokens: Token[] = [];
  private bracketDepth: number = 0;
  private atLineStart: boolean = true;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    // Shebang
    if (this.source.startsWith("#!")) {
      this.readShebang();
    }

    while (this.pos < this.source.length) {
      if (this.atLineStart && this.bracketDepth === 0) {
        this.readIndent();
        this.atLineStart = false;
      }
      this.readToken();
    }

    this.pushToken(TokenKind.Eof, "", this.makePos(), this.makePos());
    return this.tokens;
  }

  private readToken(): void {
    if (this.pos >= this.source.length) return;

    const ch = this.source[this.pos];

    // Newline
    if (ch === "\n") {
      const start = this.makePos();
      this.advance();
      const end = this.makePos();
      if (this.bracketDepth === 0) {
        this.pushToken(TokenKind.Newline, "\n", start, end);
      }
      this.atLineStart = true;
      return;
    }

    // Carriage return
    if (ch === "\r") {
      this.advance();
      return;
    }

    // Whitespace (non-newline)
    if (ch === " " || ch === "\t") {
      this.skipWhitespace();
      return;
    }

    // Block comment --- ... ---
    if (this.match("---")) {
      this.readBlockComment();
      return;
    }

    // Line comment --
    if (this.match("--")) {
      this.readLineComment();
      return;
    }

    // String literal ///...///
    if (this.match("///")) {
      this.readString();
      return;
    }

    // Regex literal /pattern/flags
    if (ch === "/" && this.isRegexStart()) {
      this.readRegex();
      return;
    }

    // Optional chaining \.
    if (ch === "\\" && this.pos + 1 < this.source.length && this.source[this.pos + 1] === ".") {
      const start = this.makePos();
      this.advance();
      this.advance();
      this.pushToken(TokenKind.OptionalDot, "\\.", start, this.makePos());
      return;
    }

    // Backslash (computed access)
    if (ch === "\\") {
      const start = this.makePos();
      this.advance();
      this.pushToken(TokenKind.Backslash, "\\", start, this.makePos());
      return;
    }

    // Triple dot ...
    if (this.match("...")) {
      const start = this.makePos();
      this.advance();
      this.advance();
      this.advance();
      this.pushToken(TokenKind.DotDotDot, "...", start, this.makePos());
      return;
    }

    // Double dot ..
    if (this.match("..")) {
      const start = this.makePos();
      this.advance();
      this.advance();
      this.pushToken(TokenKind.DotDot, "..", start, this.makePos());
      return;
    }

    // Dot
    if (ch === ".") {
      const start = this.makePos();
      this.advance();
      this.pushToken(TokenKind.Dot, ".", start, this.makePos());
      return;
    }

    // Brackets
    if (ch === "[") {
      const start = this.makePos();
      this.advance();
      this.bracketDepth++;
      this.pushToken(TokenKind.LBracket, "[", start, this.makePos());
      return;
    }
    if (ch === "]") {
      const start = this.makePos();
      this.advance();
      if (this.bracketDepth > 0) this.bracketDepth--;
      this.pushToken(TokenKind.RBracket, "]", start, this.makePos());
      return;
    }

    // Comma
    if (ch === ",") {
      const start = this.makePos();
      this.advance();
      this.pushToken(TokenKind.Comma, ",", start, this.makePos());
      return;
    }

    // Semicolon
    if (ch === ";") {
      const start = this.makePos();
      this.advance();
      this.pushToken(TokenKind.Semicolon, ";", start, this.makePos());
      return;
    }

    // Number (digit or negative number after certain tokens)
    if (this.isDigit(ch) || (ch === "-" && this.isNegativeNumberStart())) {
      this.readNumber();
      return;
    }

    // Identifier / keyword
    if (this.isIdentStart(ch)) {
      this.readWord();
      return;
    }

    // Unknown character
    const start = this.makePos();
    const text = ch;
    this.advance();
    this.pushToken(TokenKind.Error, text, start, this.makePos());
  }

  private readShebang(): void {
    const start = this.makePos();
    while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
      this.advance();
    }
    this.pushToken(TokenKind.Shebang, this.source.slice(start.offset, this.pos), start, this.makePos());
    if (this.pos < this.source.length) {
      this.advance(); // consume newline
      this.atLineStart = true;
    }
  }

  private readIndent(): void {
    const start = this.makePos();
    let spaces = 0;
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === " ") {
        spaces++;
        this.advance();
      } else if (ch === "\t") {
        spaces += 2;
        this.advance();
      } else {
        break;
      }
    }
    // Skip empty/comment-only lines
    if (this.pos < this.source.length && this.source[this.pos] !== "\n" && this.source[this.pos] !== "\r" &&
        !this.match("--")) {
      if (spaces > 0) {
        const token: Token = {
          kind: TokenKind.Indent,
          text: this.source.slice(start.offset, this.pos),
          value: spaces,
          span: { start, end: this.makePos() },
        };
        this.tokens.push(token);
      }
    }
  }

  private readBlockComment(): void {
    const start = this.makePos();
    this.advance(); // -
    this.advance(); // -
    this.advance(); // -

    while (this.pos < this.source.length) {
      if (this.match("---")) {
        this.advance();
        this.advance();
        this.advance();
        this.pushToken(TokenKind.BlockComment, this.source.slice(start.offset, this.pos), start, this.makePos());
        return;
      }
      if (this.source[this.pos] === "\n") {
        this.advance();
        this.atLineStart = true;
      } else {
        this.advance();
      }
    }
    // Unterminated block comment
    this.pushToken(TokenKind.BlockComment, this.source.slice(start.offset, this.pos), start, this.makePos());
  }

  private readLineComment(): void {
    const start = this.makePos();
    this.advance(); // -
    this.advance(); // -
    while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
      this.advance();
    }
    this.pushToken(TokenKind.Comment, this.source.slice(start.offset, this.pos), start, this.makePos());
  }

  private readString(): void {
    const start = this.makePos();
    this.advance(); // /
    this.advance(); // /
    this.advance(); // /

    let value = "";
    let hasInterpolation = false;

    while (this.pos < this.source.length) {
      if (this.match("///")) {
        this.advance();
        this.advance();
        this.advance();
        const token: Token = {
          kind: TokenKind.Str,
          text: this.source.slice(start.offset, this.pos),
          value,
          span: { start, end: this.makePos() },
        };
        this.tokens.push(token);
        return;
      }

      const ch = this.source[this.pos];

      if (ch === "\\") {
        this.advance();
        if (this.pos < this.source.length) {
          const esc = this.source[this.pos];
          switch (esc) {
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            case "\\": value += "\\"; break;
            case "/": value += "/"; break;
            case "[": value += "["; break;
            case "]": value += "]"; break;
            default: value += "\\" + esc; break;
          }
          this.advance();
        }
        continue;
      }

      if (ch === "[") {
        hasInterpolation = true;
        let depth = 1;
        value += "[";
        this.advance();
        while (this.pos < this.source.length && depth > 0) {
          const c = this.source[this.pos];
          if (c === "[") depth++;
          if (c === "]") depth--;
          if (depth > 0) value += c;
          this.advance();
        }
        value += "]";
        continue;
      }

      value += ch;
      this.advance();
    }

    // Unterminated string
    const token: Token = {
      kind: TokenKind.Str,
      text: this.source.slice(start.offset, this.pos),
      value,
      span: { start, end: this.makePos() },
    };
    this.tokens.push(token);
  }

  private readRegex(): void {
    const start = this.makePos();
    this.advance(); // /

    let pattern = "";
    let escaped = false;
    let inCharClass = false;

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (escaped) {
        pattern += ch;
        escaped = false;
        this.advance();
        continue;
      }
      if (ch === "\\") {
        pattern += ch;
        escaped = true;
        this.advance();
        continue;
      }
      if (ch === "[") {
        inCharClass = true;
        pattern += ch;
        this.advance();
        continue;
      }
      if (ch === "]" && inCharClass) {
        inCharClass = false;
        pattern += ch;
        this.advance();
        continue;
      }
      if (ch === "/" && !inCharClass) {
        this.advance(); // consume closing /
        break;
      }
      if (ch === "\n") break; // unterminated
      pattern += ch;
      this.advance();
    }

    // Read flags
    let flags = "";
    while (this.pos < this.source.length && /[gimsuy]/.test(this.source[this.pos])) {
      flags += this.source[this.pos];
      this.advance();
    }

    const text = this.source.slice(start.offset, this.pos);
    const token: Token = {
      kind: TokenKind.Regex,
      text,
      value: pattern,
      span: { start, end: this.makePos() },
    };
    this.tokens.push(token);
  }

  private readNumber(): void {
    const start = this.makePos();
    let text = "";
    let isFloat = false;

    if (this.source[this.pos] === "-") {
      text += "-";
      this.advance();
    }

    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      text += this.source[this.pos];
      this.advance();
    }

    if (this.pos < this.source.length && this.source[this.pos] === "." &&
        this.pos + 1 < this.source.length && this.isDigit(this.source[this.pos + 1])) {
      isFloat = true;
      text += ".";
      this.advance();
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        text += this.source[this.pos];
        this.advance();
      }
    }

    const kind = isFloat ? TokenKind.Float : TokenKind.Int;
    const value = isFloat ? parseFloat(text) : parseInt(text, 10);
    this.pushToken(kind, text, start, this.makePos(), value);
  }

  private readWord(): void {
    const start = this.makePos();
    let text = "";

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (this.isIdentChar(ch)) {
        text += ch;
        this.advance();
      } else {
        break;
      }
    }

    // Remove trailing hyphens (e.g., identifier followed by negative number)
    while (text.endsWith("-")) {
      text = text.slice(0, -1);
      this.pos--;
      this.col--;
    }

    const keywordKind = KEYWORDS.get(text);
    if (keywordKind !== undefined) {
      this.pushToken(keywordKind, text, start, this.makePos());
    } else {
      this.pushToken(TokenKind.Ident, text, start, this.makePos());
    }
  }

  // --- Helpers ---

  private makePos(): Position {
    return { line: this.line, column: this.col, offset: this.pos };
  }

  private advance(): void {
    if (this.pos < this.source.length) {
      if (this.source[this.pos] === "\n") {
        this.line++;
        this.col = 0;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  private match(s: string): boolean {
    return this.source.startsWith(s, this.pos);
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === " " || ch === "\t") {
        this.advance();
      } else {
        break;
      }
    }
  }

  private pushToken(kind: TokenKind, text: string, start: Position, end: Position, value?: string | number): void {
    const token: Token = {
      kind,
      text,
      span: { start, end },
    };
    if (value !== undefined) {
      token.value = value;
    }
    this.tokens.push(token);
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  private isIdentChar(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch) || ch === "-";
  }

  private isNegativeNumberStart(): boolean {
    if (this.pos + 1 >= this.source.length) return false;
    if (!this.isDigit(this.source[this.pos + 1])) return false;

    // Check previous non-trivia token
    const prev = this.lastNonTriviaToken();
    if (!prev) return true;

    const allowedKinds = new Set([
      TokenKind.LBracket, TokenKind.Comma, TokenKind.Semicolon,
      TokenKind.Be, TokenKind.Backslash, TokenKind.Newline,
      TokenKind.Indent, TokenKind.Return, TokenKind.To,
      TokenKind.Then, TokenKind.Coal,
    ]);
    return allowedKinds.has(prev.kind);
  }

  private isRegexStart(): boolean {
    // Regex starts with / but not /// (which is a string)
    if (this.match("///")) return false;
    // Must have content before closing /
    if (this.pos + 1 >= this.source.length) return false;
    const next = this.source[this.pos + 1];
    if (next === " " || next === "\n" || next === "\r") return false;

    // Check previous token - regex can follow:
    // be, [, ;, ,, newline, indent, return, to, then, or start of file
    const prev = this.lastNonTriviaToken();
    if (!prev) return true;

    const allowedKinds = new Set([
      TokenKind.Be, TokenKind.LBracket, TokenKind.Semicolon,
      TokenKind.Comma, TokenKind.Newline, TokenKind.Indent,
      TokenKind.Return, TokenKind.To, TokenKind.Then,
      TokenKind.Eq, TokenKind.Neq, TokenKind.And, TokenKind.Or,
      TokenKind.Not, TokenKind.If, TokenKind.Elif, TokenKind.Else,
      TokenKind.Unless, TokenKind.While, TokenKind.Until,
      TokenKind.For, TokenKind.In, TokenKind.Coal, TokenKind.Pipe,
    ]);
    return allowedKinds.has(prev.kind);
  }

  private lastNonTriviaToken(): Token | undefined {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.kind !== TokenKind.Comment && t.kind !== TokenKind.BlockComment) {
        return t;
      }
    }
    return undefined;
  }
}
