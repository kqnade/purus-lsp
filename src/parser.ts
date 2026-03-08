import { Token, TokenKind, Span } from "./token";
import {
  Program, Stmt, Expr, Param, FnBody, MatchArm, MatchArmBody,
  ClassMember, ObjectEntry, BinaryOp, PostfixModifier,
} from "./ast";

export interface ParseError {
  message: string;
  span: Span;
}

export function parse(tokens: Token[]): { program: Program; errors: ParseError[] } {
  const parser = new Parser(tokens);
  return parser.parse();
}

class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private errors: ParseError[] = [];
  private currentIndent: number = 0;

  constructor(tokens: Token[]) {
    // Filter out comments for parsing, but keep them in original for semantic tokens
    this.tokens = tokens.filter(
      (t) => t.kind !== TokenKind.Comment && t.kind !== TokenKind.BlockComment
    );
  }

  parse(): { program: Program; errors: ParseError[] } {
    const stmts: Stmt[] = [];
    this.skipNewlines();

    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) stmts.push(stmt);
      } catch {
        this.synchronize();
      }
      this.skipNewlines();
    }

    const span = stmts.length > 0
      ? this.mergeSpans(stmts[0].span, stmts[stmts.length - 1].span)
      : this.currentSpan();

    return {
      program: { type: "Program", stmts, span },
      errors: this.errors,
    };
  }

  // --- Statement Parsing ---

  private parseStatement(): Stmt | null {
    this.skipNewlines();
    if (this.isAtEnd()) return null;

    const token = this.peek();

    // Handle indent tokens (skip if at expected level)
    if (token.kind === TokenKind.Indent) {
      this.advance();
      return this.parseStatement();
    }

    switch (token.kind) {
      case TokenKind.Const:
      case TokenKind.Let:
      case TokenKind.Var:
        return this.parseVarDecl();
      case TokenKind.Fn:
        return this.parseFnDecl(false);
      case TokenKind.Async:
        if (this.peekAt(1)?.kind === TokenKind.Fn) {
          return this.parseFnDecl(true);
        }
        return this.parseExprStatement();
      case TokenKind.If:
        return this.parseIfStmt();
      case TokenKind.Unless:
        return this.parseUnlessStmt();
      case TokenKind.While:
        return this.parseWhileStmt();
      case TokenKind.Until:
        return this.parseUntilStmt();
      case TokenKind.For:
        return this.parseForStmt();
      case TokenKind.Match:
        return this.parseMatchStmt();
      case TokenKind.Try:
        return this.parseTryCatch();
      case TokenKind.Throw:
        return this.parseThrow();
      case TokenKind.Return:
        return this.parseReturn();
      case TokenKind.Break:
        return this.parseBreak();
      case TokenKind.Continue:
        return this.parseContinue();
      case TokenKind.Import:
        return this.parseImport();
      case TokenKind.Use:
        return this.parseUse();
      case TokenKind.From:
        return this.parseFromUse();
      case TokenKind.Export:
        return this.parseExport();
      case TokenKind.Pub:
        return this.parsePub();
      case TokenKind.Namespace:
        return this.parseNamespace();
      case TokenKind.Class:
        return this.parseClassDecl();
      case TokenKind.Type:
        return this.parseTypeDecl();
      case TokenKind.Delete:
        return this.parseDeleteStmt();
      default:
        return this.parseExprStatement();
    }
  }

  private parseVarDecl(): Stmt {
    const start = this.peek().span.start;
    const declToken = this.advance();
    const declKind = declToken.text as "const" | "let" | "var";

    // Array destructuring: const [a; b] be expr
    if (this.check(TokenKind.LBracket)) {
      return this.parseArrayDestruct(declKind, start);
    }

    // Object destructuring: const object[a; b] be expr
    if (this.check(TokenKind.Object)) {
      return this.parseObjectDestruct(declKind, start);
    }

    // Simple binding: const x [of Type] be expr
    const nameToken = this.expect(TokenKind.Ident, "Expected identifier");
    const name = nameToken.text;
    const nameSpan = nameToken.span;

    let typeAnnotation: string | undefined;
    if (this.check(TokenKind.Of)) {
      this.advance();
      typeAnnotation = this.expect(TokenKind.Ident, "Expected type name").text;
    }

    this.expect(TokenKind.Be, "Expected 'be'");
    const init = this.parseExpression();

    const stmt: Stmt = {
      type: "VarDecl",
      declKind,
      name,
      nameSpan,
      typeAnnotation,
      init,
      span: this.spanFrom(start),
    };

    return this.maybePostfix(stmt);
  }

  private parseArrayDestruct(declKind: "const" | "let" | "var", start: any): Stmt {
    this.advance(); // [
    const names = this.parseIdentList();
    this.expect(TokenKind.RBracket, "Expected ']'");
    this.expect(TokenKind.Be, "Expected 'be'");
    const init = this.parseExpression();
    return {
      type: "ArrayDestruct",
      declKind,
      names,
      init,
      span: this.spanFrom(start),
    };
  }

  private parseObjectDestruct(declKind: "const" | "let" | "var", start: any): Stmt {
    this.advance(); // object
    this.expect(TokenKind.LBracket, "Expected '['");
    const names = this.parseIdentList();
    this.expect(TokenKind.RBracket, "Expected ']'");
    this.expect(TokenKind.Be, "Expected 'be'");
    const init = this.parseExpression();
    return {
      type: "ObjectDestruct",
      declKind,
      names,
      init,
      span: this.spanFrom(start),
    };
  }

  private parseFnDecl(isAsync: boolean): FnDeclStmt {
    const start = this.peek().span.start;
    if (isAsync) this.advance(); // async
    this.advance(); // fn

    // Named function: fn name params body
    const nameToken = this.expect(TokenKind.Ident, "Expected function name");
    const params = this.parseParamList();

    let returnType: string | undefined;
    if (this.check(TokenKind.Gives)) {
      this.advance();
      returnType = this.expect(TokenKind.Ident, "Expected return type").text;
    }

    const body = this.parseFnBody();

    return {
      type: "FnDecl",
      name: nameToken.text,
      nameSpan: nameToken.span,
      params,
      returnType,
      body,
      isAsync,
      span: this.spanFrom(start),
    };
  }

  private parseParamList(): Param[] {
    const params: Param[] = [];

    while (!this.isAtEnd() && !this.check(TokenKind.To) && !this.check(TokenKind.Gives) &&
           !this.check(TokenKind.Newline) && !this.check(TokenKind.Indent) &&
           !this.isBlockStart()) {
      if (this.check(TokenKind.Ident)) {
        const nameToken = this.advance();
        let typeAnnotation: string | undefined;
        if (this.check(TokenKind.Of)) {
          this.advance();
          typeAnnotation = this.expect(TokenKind.Ident, "Expected type name").text;
        }
        params.push({
          name: nameToken.text,
          nameSpan: nameToken.span,
          typeAnnotation,
        });
        if (this.check(TokenKind.Semicolon)) {
          this.advance();
        }
      } else {
        break;
      }
    }

    return params;
  }

  private parseFnBody(): FnBody {
    if (this.check(TokenKind.To)) {
      this.advance();
      const expr = this.parseExpression();
      return { kind: "expr", expr };
    }

    const stmts = this.parseBlock();
    return { kind: "block", stmts };
  }

  private parseBlock(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipNewlines();

    // Determine block indent level
    const blockIndent = this.getIndentLevel();
    if (blockIndent <= this.currentIndent) {
      return stmts;
    }

    const prevIndent = this.currentIndent;
    this.currentIndent = blockIndent;

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const indent = this.getIndentLevel();
      if (indent < this.currentIndent) break;

      if (this.check(TokenKind.Indent)) {
        this.advance();
      }

      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
    }

    this.currentIndent = prevIndent;
    return stmts;
  }

  private parseIfStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // if
    const condition = this.parseExpression();

    // Inline if: if cond then expr else expr (handled as expression)
    if (this.check(TokenKind.Then)) {
      // This is actually an inline if expression used as statement
      this.advance();
      const thenExpr = this.parseExpression();
      this.expect(TokenKind.Else, "Expected 'else' in inline if");
      const elseExpr = this.parseExpression();
      return {
        type: "ExprStmt",
        expr: {
          type: "IfExpr",
          condition,
          then: thenExpr,
          else: elseExpr,
          span: this.spanFrom(start),
        },
        span: this.spanFrom(start),
      };
    }

    const body = this.parseBlock();

    const elifs: { condition: Expr; body: Stmt[] }[] = [];
    let elseBody: Stmt[] | undefined;

    while (true) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      // Check indent
      const indent = this.getIndentLevel();
      if (this.check(TokenKind.Indent)) {
        const indentVal = this.peek().value as number;
        if (indentVal > this.currentIndent) break;
        this.advance();
      }

      if (this.check(TokenKind.Elif)) {
        this.advance();
        const elifCond = this.parseExpression();
        const elifBody = this.parseBlock();
        elifs.push({ condition: elifCond, body: elifBody });
      } else if (this.check(TokenKind.Else)) {
        this.advance();
        if (this.check(TokenKind.If)) {
          // else if
          this.advance();
          const elifCond = this.parseExpression();
          const elifBody = this.parseBlock();
          elifs.push({ condition: elifCond, body: elifBody });
        } else {
          elseBody = this.parseBlock();
          break;
        }
      } else {
        break;
      }
    }

    return {
      type: "If",
      condition,
      body,
      elifs,
      elseBody,
      span: this.spanFrom(start),
    };
  }

  private parseUnlessStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // unless
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { type: "Unless", condition, body, span: this.spanFrom(start) };
  }

  private parseWhileStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // while
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { type: "While", condition, body, span: this.spanFrom(start) };
  }

  private parseUntilStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // until
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { type: "Until", condition, body, span: this.spanFrom(start) };
  }

  private parseForStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // for

    const firstIdent = this.expect(TokenKind.Ident, "Expected variable name");

    // for i; item in ... (with index)
    if (this.check(TokenKind.Semicolon)) {
      this.advance();
      const secondIdent = this.expect(TokenKind.Ident, "Expected variable name");
      this.expect(TokenKind.In, "Expected 'in'");

      if (this.check(TokenKind.Range)) {
        this.advance();
        const rangeStart = this.parseExpression();
        this.expect(TokenKind.Semicolon, "Expected ';'");
        const rangeEnd = this.parseExpression();
        const body = this.parseBlock();
        return {
          type: "ForRange",
          variable: firstIdent.text,
          variableSpan: firstIdent.span,
          start: rangeStart,
          end: rangeEnd,
          body,
          span: this.spanFrom(start),
        };
      }

      const iterable = this.parseExpression();
      const body = this.parseBlock();
      return {
        type: "ForIn",
        variable: secondIdent.text,
        variableSpan: secondIdent.span,
        index: firstIdent.text,
        indexSpan: firstIdent.span,
        iterable,
        body,
        span: this.spanFrom(start),
      };
    }

    this.expect(TokenKind.In, "Expected 'in'");

    // for i in range start; end
    if (this.check(TokenKind.Range)) {
      this.advance();
      const rangeStart = this.parseExpression();
      this.expect(TokenKind.Semicolon, "Expected ';'");
      const rangeEnd = this.parseExpression();
      const body = this.parseBlock();
      return {
        type: "ForRange",
        variable: firstIdent.text,
        variableSpan: firstIdent.span,
        start: rangeStart,
        end: rangeEnd,
        body,
        span: this.spanFrom(start),
      };
    }

    // for item in iterable
    const iterable = this.parseExpression();
    const body = this.parseBlock();
    return {
      type: "ForIn",
      variable: firstIdent.text,
      variableSpan: firstIdent.span,
      iterable,
      body,
      span: this.spanFrom(start),
    };
  }

  private parseMatchStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // match
    const subject = this.parseExpression();
    this.skipNewlines();

    const arms: MatchArm[] = [];
    const blockIndent = this.getIndentLevel();
    if (blockIndent <= this.currentIndent) {
      return { type: "Match", subject, arms, span: this.spanFrom(start) };
    }

    const prevIndent = this.currentIndent;
    this.currentIndent = blockIndent;

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const indent = this.getIndentLevel();
      if (indent < this.currentIndent) break;
      if (this.check(TokenKind.Indent)) this.advance();

      if (this.check(TokenKind.When)) {
        arms.push(this.parseWhenArm());
      } else if (this.check(TokenKind.Else)) {
        arms.push(this.parseElseArm());
        break;
      } else {
        break;
      }
    }

    this.currentIndent = prevIndent;
    return { type: "Match", subject, arms, span: this.spanFrom(start) };
  }

  private parseWhenArm(): MatchArm {
    const start = this.peek().span.start;
    this.advance(); // when
    const pattern = this.parseExpression();

    let guard: Expr | undefined;
    if (this.check(TokenKind.If)) {
      this.advance();
      guard = this.parseExpression();
    }

    const body = this.parseMatchArmBody();
    return { pattern, guard, body, span: this.spanFrom(start) };
  }

  private parseElseArm(): MatchArm {
    const start = this.peek().span.start;
    this.advance(); // else
    const body = this.parseMatchArmBody();
    return { body, span: this.spanFrom(start) };
  }

  private parseMatchArmBody(): MatchArmBody {
    if (this.check(TokenKind.Then)) {
      this.advance();
      const expr = this.parseExpression();
      return { kind: "expr", expr };
    }
    const stmts = this.parseBlock();
    if (stmts.length > 0) {
      return { kind: "block", stmts };
    }
    // If no block, try to parse expression on same line
    const expr = this.parseExpression();
    return { kind: "expr", expr };
  }

  private parseTryCatch(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // try
    const tryBody = this.parseBlock();

    this.skipNewlines();
    if (this.check(TokenKind.Indent)) this.advance();
    this.expect(TokenKind.Catch, "Expected 'catch'");

    let catchVar: string | undefined;
    let catchVarSpan: Span | undefined;
    if (this.check(TokenKind.Ident)) {
      const v = this.advance();
      catchVar = v.text;
      catchVarSpan = v.span;
    }

    const catchBody = this.parseBlock();

    let finallyBody: Stmt[] | undefined;
    this.skipNewlines();
    if (this.check(TokenKind.Indent)) this.advance();
    if (this.check(TokenKind.Finally)) {
      this.advance();
      finallyBody = this.parseBlock();
    }

    return {
      type: "TryCatch",
      tryBody,
      catchVar,
      catchVarSpan,
      catchBody,
      finallyBody,
      span: this.spanFrom(start),
    };
  }

  private parseThrow(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // throw
    const expr = this.parseExpression();
    const stmt: Stmt = { type: "Throw", expr, span: this.spanFrom(start) };
    return this.maybePostfix(stmt);
  }

  private parseReturn(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // return

    if (this.isStatementEnd()) {
      return { type: "Return", span: this.spanFrom(start) };
    }

    const expr = this.parseExpression();
    return { type: "Return", expr, span: this.spanFrom(start) };
  }

  private parseBreak(): Stmt {
    const start = this.peek().span.start;
    this.advance();
    return { type: "Break", span: this.spanFrom(start) };
  }

  private parseContinue(): Stmt {
    const start = this.peek().span.start;
    this.advance();
    return { type: "Continue", span: this.spanFrom(start) };
  }

  private parseImport(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // import

    // Side-effect import: import ///path///
    if (this.check(TokenKind.Str)) {
      const source = this.advance().value as string;
      return { type: "SideEffectImport", source, span: this.spanFrom(start) };
    }

    // import all as name from ///path///
    if (this.check(TokenKind.All)) {
      this.advance();
      this.expect(TokenKind.As, "Expected 'as'");
      const nameToken = this.expect(TokenKind.Ident, "Expected identifier");
      this.expect(TokenKind.From, "Expected 'from'");
      const source = this.expect(TokenKind.Str, "Expected string").value as string;
      return {
        type: "Import",
        namespaceName: nameToken.text,
        namespaceNameSpan: nameToken.span,
        source,
        span: this.spanFrom(start),
      };
    }

    // import [names] from ///path///
    if (this.check(TokenKind.LBracket)) {
      this.advance();
      const names = this.parseIdentList();
      this.expect(TokenKind.RBracket, "Expected ']'");
      this.expect(TokenKind.From, "Expected 'from'");
      const source = this.expect(TokenKind.Str, "Expected string").value as string;
      return {
        type: "Import",
        names,
        source,
        span: this.spanFrom(start),
      };
    }

    // import name from ///path/// or import name, [names] from ///path///
    const defaultNameToken = this.expect(TokenKind.Ident, "Expected identifier");

    let names: { name: string; span: Span }[] | undefined;
    if (this.check(TokenKind.Comma)) {
      this.advance();
      this.expect(TokenKind.LBracket, "Expected '['");
      names = this.parseIdentList();
      this.expect(TokenKind.RBracket, "Expected ']'");
    }

    this.expect(TokenKind.From, "Expected 'from'");
    const source = this.expect(TokenKind.Str, "Expected string").value as string;

    return {
      type: "Import",
      defaultName: defaultNameToken.text,
      defaultNameSpan: defaultNameToken.span,
      names,
      source,
      span: this.spanFrom(start),
    };
  }

  private parseUse(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // use
    const path = this.parseDottedName();
    return { type: "Use", path, span: this.spanFrom(start) };
  }

  private parseFromUse(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // from

    // Check: from path use names OR from path import ...
    const path = this.parseDottedName();
    this.expect(TokenKind.Use, "Expected 'use'");

    const names: { name: string; span: Span }[] = [];
    do {
      const nameToken = this.expect(TokenKind.Ident, "Expected identifier");
      names.push({ name: nameToken.text, span: nameToken.span });
    } while (this.check(TokenKind.Comma) && this.advance());

    return { type: "FromUse", path, names, span: this.spanFrom(start) };
  }

  private parseExport(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // export

    if (this.check(TokenKind.Default)) {
      this.advance();
      const decl = this.parseStatement();
      if (!decl) {
        this.addError("Expected declaration after 'export default'");
        return { type: "ExprStmt", expr: this.dummyExpr(), span: this.spanFrom(start) };
      }
      return { type: "ExportDefault", decl, span: this.spanFrom(start) };
    }

    const decl = this.parseStatement();
    if (!decl) {
      this.addError("Expected declaration after 'export'");
      return { type: "ExprStmt", expr: this.dummyExpr(), span: this.spanFrom(start) };
    }
    return { type: "Export", decl, span: this.spanFrom(start) };
  }

  private parsePub(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // pub
    const decl = this.parseStatement();
    if (!decl) {
      this.addError("Expected declaration after 'pub'");
      return { type: "ExprStmt", expr: this.dummyExpr(), span: this.spanFrom(start) };
    }
    return { type: "Pub", decl, span: this.spanFrom(start) };
  }

  private parseNamespace(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // namespace
    const nameToken = this.expect(TokenKind.Ident, "Expected namespace name");
    const body = this.parseBlock();
    return {
      type: "Namespace",
      name: nameToken.text,
      nameSpan: nameToken.span,
      body,
      span: this.spanFrom(start),
    };
  }

  private parseClassDecl(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // class
    const nameToken = this.expect(TokenKind.Ident, "Expected class name");

    let superClass: string | undefined;
    if (this.check(TokenKind.Extends)) {
      this.advance();
      superClass = this.expect(TokenKind.Ident, "Expected superclass name").text;
    }

    const members = this.parseClassBody();

    return {
      type: "ClassDecl",
      name: nameToken.text,
      nameSpan: nameToken.span,
      superClass,
      members,
      span: this.spanFrom(start),
    };
  }

  private parseClassBody(): ClassMember[] {
    const members: ClassMember[] = [];
    this.skipNewlines();

    const blockIndent = this.getIndentLevel();
    if (blockIndent <= this.currentIndent) return members;

    const prevIndent = this.currentIndent;
    this.currentIndent = blockIndent;

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const indent = this.getIndentLevel();
      if (indent < this.currentIndent) break;
      if (this.check(TokenKind.Indent)) this.advance();

      const member = this.parseClassMember();
      if (member) members.push(member);
    }

    this.currentIndent = prevIndent;
    return members;
  }

  private parseClassMember(): ClassMember | null {
    const start = this.peek().span.start;

    // private field
    if (this.check(TokenKind.Private)) {
      this.advance();
      const nameToken = this.expect(TokenKind.Ident, "Expected field name");
      let init: Expr | undefined;
      if (this.check(TokenKind.Be)) {
        this.advance();
        init = this.parseExpression();
      }
      return {
        type: "PrivateField",
        name: nameToken.text,
        nameSpan: nameToken.span,
        init,
        span: this.spanFrom(start),
      };
    }

    // getter: get fn name ...
    if (this.check(TokenKind.Get) && this.peekAt(1)?.kind === TokenKind.Fn) {
      this.advance(); // get
      this.advance(); // fn
      const nameToken = this.expect(TokenKind.Ident, "Expected getter name");
      let returnType: string | undefined;
      if (this.check(TokenKind.Gives)) {
        this.advance();
        returnType = this.expect(TokenKind.Ident, "Expected return type").text;
      }
      const body = this.parseFnBody();
      return {
        type: "Getter",
        name: nameToken.text,
        nameSpan: nameToken.span,
        returnType,
        body,
        span: this.spanFrom(start),
      };
    }

    // setter: set fn name param ...
    if (this.check(TokenKind.Set) && this.peekAt(1)?.kind === TokenKind.Fn) {
      this.advance(); // set
      this.advance(); // fn
      const nameToken = this.expect(TokenKind.Ident, "Expected setter name");
      const paramName = this.expect(TokenKind.Ident, "Expected parameter name").text;
      const body = this.parseFnBody();
      return {
        type: "Setter",
        name: nameToken.text,
        nameSpan: nameToken.span,
        paramName,
        body,
        span: this.spanFrom(start),
      };
    }

    // static [async] fn name ...
    let isStatic = false;
    let isAsync = false;

    if (this.check(TokenKind.Static)) {
      isStatic = true;
      this.advance();
    }

    if (this.check(TokenKind.Async)) {
      isAsync = true;
      this.advance();
    }

    if (this.check(TokenKind.Fn)) {
      this.advance();

      // Constructor: fn new[params]
      if (this.check(TokenKind.New)) {
        this.advance();
        let params: Param[] = [];
        if (this.check(TokenKind.LBracket)) {
          this.advance();
          params = this.parseBracketParams();
          this.expect(TokenKind.RBracket, "Expected ']'");
        }
        const body = this.parseFnBody();
        return {
          type: "Constructor",
          params,
          body,
          span: this.spanFrom(start),
        };
      }

      // Method: fn name params body
      const nameToken = this.expect(TokenKind.Ident, "Expected method name");
      const params = this.parseParamList();

      let returnType: string | undefined;
      if (this.check(TokenKind.Gives)) {
        this.advance();
        returnType = this.expect(TokenKind.Ident, "Expected return type").text;
      }

      const body = this.parseFnBody();
      return {
        type: "Method",
        name: nameToken.text,
        nameSpan: nameToken.span,
        params,
        returnType,
        body,
        isStatic,
        isAsync,
        span: this.spanFrom(start),
      };
    }

    this.addError("Expected class member");
    this.advance();
    return null;
  }

  private parseTypeDecl(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // type
    const nameToken = this.expect(TokenKind.Ident, "Expected type name");
    this.expect(TokenKind.Be, "Expected 'be'");
    const valueToken = this.expect(TokenKind.Ident, "Expected type value");
    return {
      type: "TypeDecl",
      name: nameToken.text,
      nameSpan: nameToken.span,
      value: valueToken.text,
      span: this.spanFrom(start),
    };
  }

  private parseDeleteStmt(): Stmt {
    const start = this.peek().span.start;
    this.advance(); // delete
    const expr = this.parseExpression();
    return { type: "Delete", expr, span: this.spanFrom(start) };
  }

  private parseExprStatement(): Stmt {
    const start = this.peek().span.start;
    const expr = this.parseExpression();

    // Check for assignment: expr be expr
    if (this.check(TokenKind.Be)) {
      this.advance();
      const value = this.parseExpression();
      const stmt: Stmt = {
        type: "Assign",
        target: expr,
        value,
        span: this.spanFrom(start),
      };
      return this.maybePostfix(stmt);
    }

    const stmt: Stmt = {
      type: "ExprStmt",
      expr,
      span: this.spanFrom(start),
    };
    return this.maybePostfix(stmt);
  }

  // --- Expression Parsing (Pratt) ---

  private parseExpression(): Expr {
    return this.parsePipe();
  }

  private parsePipe(): Expr {
    let left = this.parseCoal();

    while (this.check(TokenKind.Pipe)) {
      this.advance();
      const right = this.parseCoal();
      left = {
        type: "Pipe",
        left,
        right,
        span: this.mergeSpans(left.span, right.span),
      };
    }

    return left;
  }

  private parseCoal(): Expr {
    let left = this.parseOr();

    while (this.check(TokenKind.Coal)) {
      this.advance();
      const right = this.parseOr();
      left = {
        type: "Coal",
        left,
        right,
        span: this.mergeSpans(left.span, right.span),
      };
    }

    return left;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();

    while (this.check(TokenKind.Or)) {
      this.advance();
      const right = this.parseAnd();
      left = {
        type: "BinOp",
        op: "or",
        left,
        right,
        span: this.mergeSpans(left.span, right.span),
      };
    }

    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();

    while (this.check(TokenKind.And)) {
      this.advance();
      const right = this.parseEquality();
      left = {
        type: "BinOp",
        op: "and",
        left,
        right,
        span: this.mergeSpans(left.span, right.span),
      };
    }

    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseComparison();

    while (true) {
      if (this.check(TokenKind.Eq)) {
        this.advance();
        const right = this.parseComparison();
        left = { type: "BinOp", op: "eq", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Neq)) {
        this.advance();
        const right = this.parseComparison();
        left = { type: "BinOp", op: "neq", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Not) && this.peekAt(1)?.kind === TokenKind.Eq) {
        this.advance(); // not
        this.advance(); // eq
        const right = this.parseComparison();
        left = { type: "BinOp", op: "neq", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Is)) {
        this.advance();
        const typeToken = this.expect(TokenKind.Ident, "Expected type name");
        left = { type: "IsCheck", expr: left, typeName: typeToken.text, span: this.mergeSpans(left.span, typeToken.span) };
      } else if (this.check(TokenKind.Instanceof)) {
        this.advance();
        const classToken = this.expect(TokenKind.Ident, "Expected class name");
        left = { type: "Instanceof", expr: left, className: classToken.text, span: this.mergeSpans(left.span, classToken.span) };
      } else {
        break;
      }
    }

    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseAddition();

    while (true) {
      if (this.check(TokenKind.Lt)) {
        this.advance();
        if (this.check(TokenKind.Eq)) {
          this.advance();
          const right = this.parseAddition();
          left = { type: "BinOp", op: "le", left, right, span: this.mergeSpans(left.span, right.span) };
        } else {
          const right = this.parseAddition();
          left = { type: "BinOp", op: "lt", left, right, span: this.mergeSpans(left.span, right.span) };
        }
      } else if (this.check(TokenKind.Gt)) {
        this.advance();
        if (this.check(TokenKind.Eq)) {
          this.advance();
          const right = this.parseAddition();
          left = { type: "BinOp", op: "ge", left, right, span: this.mergeSpans(left.span, right.span) };
        } else {
          const right = this.parseAddition();
          left = { type: "BinOp", op: "gt", left, right, span: this.mergeSpans(left.span, right.span) };
        }
      } else if (this.check(TokenKind.Le)) {
        this.advance();
        const right = this.parseAddition();
        left = { type: "BinOp", op: "le", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Ge)) {
        this.advance();
        const right = this.parseAddition();
        left = { type: "BinOp", op: "ge", left, right, span: this.mergeSpans(left.span, right.span) };
      } else {
        break;
      }
    }

    return left;
  }

  private parseAddition(): Expr {
    let left = this.parseMultiplication();

    while (true) {
      if (this.check(TokenKind.Add)) {
        this.advance();
        const right = this.parseMultiplication();
        left = { type: "BinOp", op: "add", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Sub)) {
        this.advance();
        const right = this.parseMultiplication();
        left = { type: "BinOp", op: "sub", left, right, span: this.mergeSpans(left.span, right.span) };
      } else {
        break;
      }
    }

    return left;
  }

  private parseMultiplication(): Expr {
    let left = this.parsePower();

    while (true) {
      if (this.check(TokenKind.Mul)) {
        this.advance();
        const right = this.parsePower();
        left = { type: "BinOp", op: "mul", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Div)) {
        this.advance();
        const right = this.parsePower();
        left = { type: "BinOp", op: "div", left, right, span: this.mergeSpans(left.span, right.span) };
      } else if (this.check(TokenKind.Mod)) {
        this.advance();
        const right = this.parsePower();
        left = { type: "BinOp", op: "mod", left, right, span: this.mergeSpans(left.span, right.span) };
      } else {
        break;
      }
    }

    return left;
  }

  private parsePower(): Expr {
    const base = this.parseUnary();

    if (this.check(TokenKind.Pow)) {
      this.advance();
      const exp = this.parsePower(); // right-associative
      return { type: "BinOp", op: "pow", left: base, right: exp, span: this.mergeSpans(base.span, exp.span) };
    }

    return base;
  }

  private parseUnary(): Expr {
    const start = this.peek().span.start;

    if (this.check(TokenKind.Not)) {
      this.advance();
      const operand = this.parseUnary();
      return { type: "Unary", op: "not", operand, span: this.spanFrom(start) };
    }

    if (this.check(TokenKind.Neg)) {
      this.advance();
      const operand = this.parseUnary();
      return { type: "Unary", op: "neg", operand, span: this.spanFrom(start) };
    }

    if (this.check(TokenKind.Typeof)) {
      this.advance();
      const expr = this.parseUnary();
      return { type: "Typeof", expr, span: this.spanFrom(start) };
    }

    if (this.check(TokenKind.Await)) {
      this.advance();
      const expr = this.parseUnary();
      return { type: "Await", expr, span: this.spanFrom(start) };
    }

    if (this.check(TokenKind.New)) {
      this.advance();
      const callee = this.parsePostfix();
      return { type: "New", callee, span: this.spanFrom(start) };
    }

    if (this.check(TokenKind.Delete)) {
      this.advance();
      const expr = this.parseUnary();
      return { type: "DeleteExpr", expr, span: this.spanFrom(start) };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();

    while (true) {
      // Dot access: expr.member
      if (this.check(TokenKind.Dot)) {
        this.advance();
        const memberToken = this.expect(TokenKind.Ident, "Expected member name");
        expr = {
          type: "DotAccess",
          object: expr,
          member: memberToken.text,
          memberSpan: memberToken.span,
          span: this.mergeSpans(expr.span, memberToken.span),
        };
        continue;
      }

      // Optional chaining: expr\.member
      if (this.check(TokenKind.OptionalDot)) {
        this.advance();
        const memberToken = this.expect(TokenKind.Ident, "Expected member name");
        expr = {
          type: "OptionalDot",
          object: expr,
          member: memberToken.text,
          memberSpan: memberToken.span,
          span: this.mergeSpans(expr.span, memberToken.span),
        };
        continue;
      }

      // Function call or computed access: expr[...]
      if (this.check(TokenKind.LBracket)) {
        const saved = this.pos;
        this.advance(); // [

        // Computed access: expr[\index] or expr[\start..end]
        if (this.check(TokenKind.Backslash)) {
          this.advance();
          const index = this.parseExpression();

          // Slice: expr[\start..end] or expr[\start...end]
          if (this.check(TokenKind.DotDot)) {
            this.advance();
            const endExpr = this.parseExpression();
            this.expect(TokenKind.RBracket, "Expected ']'");
            expr = {
              type: "Slice",
              object: expr,
              start: index,
              end: endExpr,
              inclusive: true,
              span: this.mergeSpans(expr.span, this.prevSpan()),
            };
            continue;
          }
          if (this.check(TokenKind.DotDotDot)) {
            this.advance();
            const endExpr = this.parseExpression();
            this.expect(TokenKind.RBracket, "Expected ']'");
            expr = {
              type: "Slice",
              object: expr,
              start: index,
              end: endExpr,
              inclusive: false,
              span: this.mergeSpans(expr.span, this.prevSpan()),
            };
            continue;
          }

          this.expect(TokenKind.RBracket, "Expected ']'");
          expr = {
            type: "ComputedAccess",
            object: expr,
            index,
            span: this.mergeSpans(expr.span, this.prevSpan()),
          };
          continue;
        }

        // Function call: expr[args]
        const args = this.parseArgList();
        this.expect(TokenKind.RBracket, "Expected ']'");
        expr = {
          type: "Call",
          callee: expr,
          args,
          span: this.mergeSpans(expr.span, this.prevSpan()),
        };
        continue;
      }

      // Type cast: expr as Type
      if (this.check(TokenKind.As)) {
        this.advance();
        const typeToken = this.expect(TokenKind.Ident, "Expected type name");
        expr = {
          type: "AsCast",
          expr,
          typeName: typeToken.text,
          span: this.mergeSpans(expr.span, typeToken.span),
        };
        continue;
      }

      break;
    }

    return expr;
  }

  private parsePrimary(): Expr {
    const token = this.peek();

    switch (token.kind) {
      case TokenKind.Int: {
        this.advance();
        return { type: "IntLit", value: token.value as number, span: token.span };
      }
      case TokenKind.Float: {
        this.advance();
        return { type: "FloatLit", value: token.value as number, span: token.span };
      }
      case TokenKind.Str: {
        this.advance();
        return { type: "StrLit", value: token.value as string, raw: token.text, span: token.span };
      }
      case TokenKind.Regex: {
        this.advance();
        const text = token.text;
        const lastSlash = text.lastIndexOf("/");
        const flags = text.slice(lastSlash + 1);
        return { type: "RegexLit", pattern: token.value as string, flags, span: token.span };
      }
      case TokenKind.True: {
        this.advance();
        return { type: "BoolLit", value: true, span: token.span };
      }
      case TokenKind.False: {
        this.advance();
        return { type: "BoolLit", value: false, span: token.span };
      }
      case TokenKind.Null:
      case TokenKind.Nil: {
        this.advance();
        return { type: "NullLit", span: token.span };
      }
      case TokenKind.Undefined: {
        this.advance();
        return { type: "UndefinedLit", span: token.span };
      }
      case TokenKind.This: {
        this.advance();
        return { type: "This", span: token.span };
      }
      case TokenKind.Super: {
        this.advance();
        return { type: "Super", span: token.span };
      }
      case TokenKind.Ident: {
        this.advance();
        return { type: "Ident", name: token.text, span: token.span };
      }

      // list[...] constructor
      case TokenKind.List: {
        const start = token.span.start;
        this.advance();
        this.expect(TokenKind.LBracket, "Expected '['");
        const elements = this.parseExprList();
        this.expect(TokenKind.RBracket, "Expected ']'");
        return { type: "ArrayLit", elements, span: this.spanFrom(start) };
      }

      // object[...] constructor
      case TokenKind.Object: {
        const start = token.span.start;
        this.advance();
        this.expect(TokenKind.LBracket, "Expected '['");
        const entries = this.parseObjectEntries();
        this.expect(TokenKind.RBracket, "Expected ']'");
        return { type: "ObjectLit", entries, span: this.spanFrom(start) };
      }

      // Bracket expression: [], [be], [a, b], [a..b], [key be val]
      case TokenKind.LBracket: {
        return this.parseBracketExpr();
      }

      // Function expression: fn params to expr | fn params block
      case TokenKind.Fn: {
        return this.parseFnExpr(false);
      }

      // Async function expression: async fn ...
      case TokenKind.Async: {
        if (this.peekAt(1)?.kind === TokenKind.Fn) {
          return this.parseFnExpr(true);
        }
        this.advance();
        return { type: "Ident", name: "async", span: token.span };
      }

      // Inline if expression: if cond then a else b
      case TokenKind.If: {
        return this.parseIfExpr();
      }

      // Match expression
      case TokenKind.Match: {
        return this.parseMatchExpr();
      }

      // Try expression
      case TokenKind.Try: {
        return this.parseTryExpr();
      }

      default: {
        this.addError(`Unexpected token: ${token.text}`);
        this.advance();
        return this.dummyExpr();
      }
    }
  }

  private parseBracketExpr(): Expr {
    const start = this.peek().span.start;
    this.advance(); // [

    // Empty array: []
    if (this.check(TokenKind.RBracket)) {
      this.advance();
      return { type: "ArrayLit", elements: [], span: this.spanFrom(start) };
    }

    // Empty object: [be]
    if (this.check(TokenKind.Be)) {
      this.advance();
      this.expect(TokenKind.RBracket, "Expected ']'");
      return { type: "ObjectLit", entries: [], span: this.spanFrom(start) };
    }

    // Parse first expression
    const first = this.parseExpression();

    // Range: [a..b] or [a...b]
    if (this.check(TokenKind.DotDot)) {
      this.advance();
      const end = this.parseExpression();
      this.expect(TokenKind.RBracket, "Expected ']'");
      return { type: "Range", start: first, end, inclusive: true, span: this.spanFrom(start) };
    }
    if (this.check(TokenKind.DotDotDot)) {
      this.advance();
      const end = this.parseExpression();
      this.expect(TokenKind.RBracket, "Expected ']'");
      return { type: "Range", start: first, end, inclusive: false, span: this.spanFrom(start) };
    }

    // Object: [key be val, ...]
    if (this.check(TokenKind.Be) && first.type === "Ident") {
      this.advance();
      const val = this.parseExpression();
      const entries: ObjectEntry[] = [{
        key: first.name,
        keySpan: first.span,
        value: val,
      }];

      while ((this.check(TokenKind.Comma) || this.check(TokenKind.Semicolon)) && !this.isAtEnd()) {
        this.advance();
        this.skipNewlines();
        if (this.check(TokenKind.RBracket)) break;
        const keyToken = this.expect(TokenKind.Ident, "Expected key");
        if (this.check(TokenKind.Be)) {
          this.advance();
          const v = this.parseExpression();
          entries.push({ key: keyToken.text, keySpan: keyToken.span, value: v });
        } else {
          entries.push({ key: keyToken.text, keySpan: keyToken.span });
        }
      }

      this.expect(TokenKind.RBracket, "Expected ']'");
      return { type: "ObjectLit", entries, span: this.spanFrom(start) };
    }

    // Array or grouping
    const elements: Expr[] = [first];
    if (this.check(TokenKind.Comma) || this.check(TokenKind.Semicolon)) {
      while ((this.check(TokenKind.Comma) || this.check(TokenKind.Semicolon)) && !this.isAtEnd()) {
        this.advance();
        this.skipNewlines();
        if (this.check(TokenKind.RBracket)) break;
        elements.push(this.parseExpression());
      }
      this.expect(TokenKind.RBracket, "Expected ']'");
      return { type: "ArrayLit", elements, span: this.spanFrom(start) };
    }

    // Single expression = grouping
    this.expect(TokenKind.RBracket, "Expected ']'");
    if (elements.length === 1) {
      return { type: "Group", expr: first, span: this.spanFrom(start) };
    }
    return { type: "ArrayLit", elements, span: this.spanFrom(start) };
  }

  private parseFnExpr(isAsync: boolean): Expr {
    const start = this.peek().span.start;
    if (isAsync) this.advance(); // async
    this.advance(); // fn

    const params = this.parseParamList();

    let returnType: string | undefined;
    if (this.check(TokenKind.Gives)) {
      this.advance();
      returnType = this.expect(TokenKind.Ident, "Expected return type").text;
    }

    const body = this.parseFnBody();

    return {
      type: "FnExpr",
      params,
      returnType,
      body,
      isAsync,
      span: this.spanFrom(start),
    };
  }

  private parseIfExpr(): Expr {
    const start = this.peek().span.start;
    this.advance(); // if
    const condition = this.parseExpression();
    this.expect(TokenKind.Then, "Expected 'then'");
    const thenExpr = this.parseExpression();
    this.expect(TokenKind.Else, "Expected 'else'");
    const elseExpr = this.parseExpression();
    return {
      type: "IfExpr",
      condition,
      then: thenExpr,
      else: elseExpr,
      span: this.spanFrom(start),
    };
  }

  private parseMatchExpr(): Expr {
    const start = this.peek().span.start;
    this.advance(); // match
    const subject = this.parseExpression();
    this.skipNewlines();

    const arms: MatchArm[] = [];
    const blockIndent = this.getIndentLevel();

    if (blockIndent > this.currentIndent) {
      const prevIndent = this.currentIndent;
      this.currentIndent = blockIndent;

      while (!this.isAtEnd()) {
        this.skipNewlines();
        if (this.isAtEnd()) break;
        const indent = this.getIndentLevel();
        if (indent < this.currentIndent) break;
        if (this.check(TokenKind.Indent)) this.advance();

        if (this.check(TokenKind.When)) {
          arms.push(this.parseWhenArm());
        } else if (this.check(TokenKind.Else)) {
          arms.push(this.parseElseArm());
          break;
        } else {
          break;
        }
      }

      this.currentIndent = prevIndent;
    }

    return {
      type: "MatchExpr",
      subject,
      arms,
      span: this.spanFrom(start),
    };
  }

  private parseTryExpr(): Expr {
    const start = this.peek().span.start;
    this.advance(); // try
    const tryBody = this.parseBlock();

    this.skipNewlines();
    if (this.check(TokenKind.Indent)) this.advance();
    this.expect(TokenKind.Catch, "Expected 'catch'");

    let catchVar: string | undefined;
    if (this.check(TokenKind.Ident)) {
      catchVar = this.advance().text;
    }

    const catchBody = this.parseBlock();

    return {
      type: "TryExpr",
      tryBody,
      catchVar,
      catchBody,
      span: this.spanFrom(start),
    };
  }

  // --- Helper Methods ---

  private parseArgList(): Expr[] {
    const args: Expr[] = [];
    this.skipNewlines();

    if (this.check(TokenKind.RBracket)) return args;

    args.push(this.parseArgExpr());

    while ((this.check(TokenKind.Semicolon) || this.check(TokenKind.Comma)) && !this.isAtEnd()) {
      this.advance();
      this.skipNewlines();
      if (this.check(TokenKind.RBracket)) break;
      args.push(this.parseArgExpr());
    }

    this.skipNewlines();
    return args;
  }

  private parseArgExpr(): Expr {
    // An argument can be a fn expression (inline callback)
    if (this.check(TokenKind.Fn)) {
      return this.parseFnExpr(false);
    }
    if (this.check(TokenKind.Async) && this.peekAt(1)?.kind === TokenKind.Fn) {
      return this.parseFnExpr(true);
    }
    return this.parseExpression();
  }

  private parseExprList(): Expr[] {
    const exprs: Expr[] = [];
    this.skipNewlines();

    if (this.check(TokenKind.RBracket)) return exprs;

    exprs.push(this.parseExpression());

    while ((this.check(TokenKind.Semicolon) || this.check(TokenKind.Comma)) && !this.isAtEnd()) {
      this.advance();
      this.skipNewlines();
      if (this.check(TokenKind.RBracket)) break;
      exprs.push(this.parseExpression());
    }

    this.skipNewlines();
    return exprs;
  }

  private parseObjectEntries(): ObjectEntry[] {
    const entries: ObjectEntry[] = [];
    this.skipNewlines();

    if (this.check(TokenKind.RBracket)) return entries;

    entries.push(this.parseObjectEntry());

    while ((this.check(TokenKind.Comma) || this.check(TokenKind.Semicolon)) && !this.isAtEnd()) {
      this.advance();
      this.skipNewlines();
      if (this.check(TokenKind.RBracket)) break;
      entries.push(this.parseObjectEntry());
    }

    this.skipNewlines();
    return entries;
  }

  private parseObjectEntry(): ObjectEntry {
    const keyToken = this.expect(TokenKind.Ident, "Expected key");
    if (this.check(TokenKind.Be)) {
      this.advance();
      const value = this.parseExpression();
      return { key: keyToken.text, keySpan: keyToken.span, value };
    }
    return { key: keyToken.text, keySpan: keyToken.span };
  }

  private parseIdentList(): { name: string; span: Span }[] {
    const names: { name: string; span: Span }[] = [];

    if (this.check(TokenKind.RBracket)) return names;

    const first = this.expect(TokenKind.Ident, "Expected identifier");
    names.push({ name: first.text, span: first.span });

    while ((this.check(TokenKind.Semicolon) || this.check(TokenKind.Comma)) && !this.isAtEnd()) {
      this.advance();
      if (this.check(TokenKind.RBracket)) break;
      const next = this.expect(TokenKind.Ident, "Expected identifier");
      names.push({ name: next.text, span: next.span });
    }

    return names;
  }

  private parseBracketParams(): Param[] {
    const params: Param[] = [];

    while (!this.isAtEnd() && !this.check(TokenKind.RBracket)) {
      const nameToken = this.expect(TokenKind.Ident, "Expected parameter name");
      let typeAnnotation: string | undefined;
      if (this.check(TokenKind.Of)) {
        this.advance();
        typeAnnotation = this.expect(TokenKind.Ident, "Expected type name").text;
      }
      params.push({ name: nameToken.text, nameSpan: nameToken.span, typeAnnotation });
      if (this.check(TokenKind.Semicolon)) this.advance();
    }

    return params;
  }

  private parseDottedName(): string {
    let name = this.expect(TokenKind.Ident, "Expected identifier").text;
    while (this.check(TokenKind.Dot)) {
      this.advance();
      name += "." + this.expect(TokenKind.Ident, "Expected identifier").text;
    }
    return name;
  }

  private maybePostfix(stmt: Stmt): Stmt {
    if (this.check(TokenKind.If) && stmt.type === "ExprStmt") {
      this.advance();
      const condition = this.parseExpression();
      (stmt as any).postfix = { kind: "if", condition } as PostfixModifier;
      (stmt as any).span = this.mergeSpans(stmt.span, condition.span);
      return stmt;
    }
    if (this.check(TokenKind.Unless) && stmt.type === "ExprStmt") {
      this.advance();
      const condition = this.parseExpression();
      (stmt as any).postfix = { kind: "unless", condition } as PostfixModifier;
      (stmt as any).span = this.mergeSpans(stmt.span, condition.span);
      return stmt;
    }
    if (this.check(TokenKind.For) && stmt.type === "ExprStmt") {
      this.advance();
      const variable = this.expect(TokenKind.Ident, "Expected variable").text;
      this.expect(TokenKind.In, "Expected 'in'");
      const iterable = this.parseExpression();
      (stmt as any).postfix = { kind: "for", variable, iterable } as PostfixModifier;
      (stmt as any).span = this.mergeSpans(stmt.span, iterable.span);
      return stmt;
    }
    return stmt;
  }

  // --- Token Navigation ---

  private peek(): Token {
    if (this.pos >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // EOF
    }
    return this.tokens[this.pos];
  }

  private peekAt(offset: number): Token | undefined {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return undefined;
    return this.tokens[idx];
  }

  private advance(): Token {
    const token = this.peek();
    if (this.pos < this.tokens.length) this.pos++;
    return token;
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private expect(kind: TokenKind, message: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }
    this.addError(message + `, got '${this.peek().text}'`);
    // Return a dummy token
    const span = this.currentSpan();
    return { kind, text: "", span };
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.peek().kind === TokenKind.Eof;
  }

  private skipNewlines(): void {
    while (!this.isAtEnd() && this.peek().kind === TokenKind.Newline) {
      this.advance();
    }
  }

  private isStatementEnd(): boolean {
    return this.isAtEnd() || this.check(TokenKind.Newline) || this.check(TokenKind.Eof);
  }

  private isBlockStart(): boolean {
    return this.isAtEnd() || this.check(TokenKind.Newline);
  }

  private getIndentLevel(): number {
    if (this.check(TokenKind.Indent)) {
      return this.peek().value as number;
    }
    return 0;
  }

  private prevSpan(): Span {
    if (this.pos > 0) {
      return this.tokens[this.pos - 1].span;
    }
    return this.currentSpan();
  }

  private currentSpan(): Span {
    const pos = this.peek().span.start;
    return { start: pos, end: pos };
  }

  private spanFrom(start: any): Span {
    const end = this.pos > 0 ? this.tokens[this.pos - 1].span.end : start;
    return { start, end };
  }

  private mergeSpans(a: Span, b: Span): Span {
    return { start: a.start, end: b.end };
  }

  private dummyExpr(): Expr {
    const span = this.currentSpan();
    return { type: "Ident", name: "<error>", span };
  }

  private addError(message: string): void {
    this.errors.push({ message, span: this.currentSpan() });
  }

  private synchronize(): void {
    while (!this.isAtEnd()) {
      if (this.check(TokenKind.Newline)) {
        this.advance();
        return;
      }
      const k = this.peek().kind;
      if (k === TokenKind.Const || k === TokenKind.Let || k === TokenKind.Var ||
          k === TokenKind.Fn || k === TokenKind.If || k === TokenKind.While ||
          k === TokenKind.For || k === TokenKind.Match || k === TokenKind.Import ||
          k === TokenKind.Export || k === TokenKind.Return || k === TokenKind.Class ||
          k === TokenKind.Try) {
        return;
      }
      this.advance();
    }
  }
}

// Re-export for convenience
type FnDeclStmt = import("./ast").FnDeclStmt;
