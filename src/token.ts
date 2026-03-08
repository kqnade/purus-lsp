export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Span {
  start: Position;
  end: Position;
}

export enum TokenKind {
  // Literals
  Int,
  Float,
  Str,
  Regex,
  True,
  False,
  Ident,

  // Declaration
  Const,
  Let,
  Var,
  Be,

  // Arithmetic
  Add,
  Sub,
  Mul,
  Div,
  Mod,
  Neg,
  Pow,

  // Comparison
  Eq,
  Neq,
  Lt,
  Gt,
  Le,
  Ge,

  // Logical
  And,
  Or,
  Not,

  // Function
  Fn,
  Return,
  To,

  // Conditional
  If,
  Elif,
  Else,
  Unless,
  Then,

  // Loop
  While,
  Until,
  For,
  In,
  Range,
  Break,
  Continue,

  // Pattern matching
  Match,
  When,

  // Pipe / Nullish
  Pipe,
  Coal,

  // Type system
  Is,
  As,
  Of,
  Gives,
  Typeof,
  Instanceof,
  Type,

  // OOP
  New,
  Delete,
  This,
  Class,
  Extends,
  Super,
  Static,
  Private,
  Get,
  Set,

  // Async
  Async,
  Await,

  // Error handling
  Try,
  Catch,
  Finally,
  Throw,

  // Module
  Import,
  From,
  Export,
  Default,
  Require,
  Use,
  Namespace,
  Pub,
  All,

  // Null family
  Null,
  Nil,
  Undefined,

  // Collection
  List,
  Object,

  // Punctuation
  LBracket,
  RBracket,
  Comma,
  Semicolon,
  Dot,
  OptionalDot,
  Backslash,
  DotDot,
  DotDotDot,

  // Whitespace-significant
  Newline,
  Indent,

  // Trivia
  Shebang,
  Comment,
  BlockComment,

  // Special
  Eof,
  Error,
}

export interface Token {
  kind: TokenKind;
  text: string;
  value?: string | number;
  span: Span;
}

export const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map([
  ["const", TokenKind.Const],
  ["let", TokenKind.Let],
  ["var", TokenKind.Var],
  ["be", TokenKind.Be],
  ["add", TokenKind.Add],
  ["sub", TokenKind.Sub],
  ["mul", TokenKind.Mul],
  ["div", TokenKind.Div],
  ["mod", TokenKind.Mod],
  ["neg", TokenKind.Neg],
  ["pow", TokenKind.Pow],
  ["eq", TokenKind.Eq],
  ["neq", TokenKind.Neq],
  ["lt", TokenKind.Lt],
  ["gt", TokenKind.Gt],
  ["le", TokenKind.Le],
  ["ge", TokenKind.Ge],
  ["and", TokenKind.And],
  ["or", TokenKind.Or],
  ["not", TokenKind.Not],
  ["fn", TokenKind.Fn],
  ["return", TokenKind.Return],
  ["to", TokenKind.To],
  ["if", TokenKind.If],
  ["elif", TokenKind.Elif],
  ["else", TokenKind.Else],
  ["unless", TokenKind.Unless],
  ["then", TokenKind.Then],
  ["while", TokenKind.While],
  ["until", TokenKind.Until],
  ["for", TokenKind.For],
  ["in", TokenKind.In],
  ["range", TokenKind.Range],
  ["break", TokenKind.Break],
  ["continue", TokenKind.Continue],
  ["match", TokenKind.Match],
  ["when", TokenKind.When],
  ["pipe", TokenKind.Pipe],
  ["coal", TokenKind.Coal],
  ["is", TokenKind.Is],
  ["as", TokenKind.As],
  ["of", TokenKind.Of],
  ["gives", TokenKind.Gives],
  ["typeof", TokenKind.Typeof],
  ["instanceof", TokenKind.Instanceof],
  ["type", TokenKind.Type],
  ["new", TokenKind.New],
  ["delete", TokenKind.Delete],
  ["this", TokenKind.This],
  ["class", TokenKind.Class],
  ["extends", TokenKind.Extends],
  ["super", TokenKind.Super],
  ["static", TokenKind.Static],
  ["private", TokenKind.Private],
  ["get", TokenKind.Get],
  ["set", TokenKind.Set],
  ["async", TokenKind.Async],
  ["await", TokenKind.Await],
  ["try", TokenKind.Try],
  ["catch", TokenKind.Catch],
  ["finally", TokenKind.Finally],
  ["throw", TokenKind.Throw],
  ["import", TokenKind.Import],
  ["from", TokenKind.From],
  ["export", TokenKind.Export],
  ["default", TokenKind.Default],
  ["require", TokenKind.Require],
  ["use", TokenKind.Use],
  ["namespace", TokenKind.Namespace],
  ["pub", TokenKind.Pub],
  ["all", TokenKind.All],
  ["true", TokenKind.True],
  ["false", TokenKind.False],
  ["null", TokenKind.Null],
  ["nil", TokenKind.Nil],
  ["undefined", TokenKind.Undefined],
  ["list", TokenKind.List],
  ["object", TokenKind.Object],
]);
