import {
  CompletionItem,
  CompletionItemKind,
} from "vscode-languageserver/node";

interface KeywordInfo {
  label: string;
  detail: string;
  documentation: string;
  kind: CompletionItemKind;
}

const keywords: KeywordInfo[] = [
  // Variable Declaration
  { label: "const", detail: "const (immutable binding)", documentation: "定数を宣言する。`const x be 42` → `const x = 42`", kind: CompletionItemKind.Keyword },
  { label: "let", detail: "let (mutable binding)", documentation: "ブロックスコープの変数を宣言する。`let x be 0` → `let x = 0`", kind: CompletionItemKind.Keyword },
  { label: "var", detail: "var (function-scoped)", documentation: "関数スコープの変数を宣言する（非推奨、`const`/`let` を使用してください）", kind: CompletionItemKind.Keyword },
  { label: "be", detail: "= (assignment)", documentation: "代入演算子。`x be 1` → `x = 1`。オブジェクトリテラル内では `:` として機能する", kind: CompletionItemKind.Operator },

  // Functions
  { label: "fn", detail: "function", documentation: "関数を宣言する。`fn name[params] ...` → `function name(params) { ... }`", kind: CompletionItemKind.Keyword },
  { label: "async", detail: "async", documentation: "非同期関数を宣言する。`async fn name[...]` → `async function name(...)`", kind: CompletionItemKind.Keyword },
  { label: "return", detail: "return", documentation: "関数から値を返す", kind: CompletionItemKind.Keyword },
  { label: "to", detail: "=> (arrow body)", documentation: "簡潔な関数本体。`fn add[a b] to a add b` → `function add(a, b) { return a + b; }`", kind: CompletionItemKind.Keyword },
  { label: "gives", detail: "(return type annotation)", documentation: "戻り値の型注釈（コンパイル時に無視される）。`fn name[x] gives number`", kind: CompletionItemKind.Keyword },

  // Arithmetic Operators
  { label: "add", detail: "+ (addition)", documentation: "加算。`a add b` → `a + b`", kind: CompletionItemKind.Operator },
  { label: "sub", detail: "- (subtraction)", documentation: "減算。`a sub b` → `a - b`", kind: CompletionItemKind.Operator },
  { label: "mul", detail: "* (multiplication)", documentation: "乗算。`a mul b` → `a * b`", kind: CompletionItemKind.Operator },
  { label: "div", detail: "/ (division)", documentation: "除算。`a div b` → `a / b`", kind: CompletionItemKind.Operator },
  { label: "mod", detail: "% (modulo)", documentation: "剰余。`a mod b` → `a % b`", kind: CompletionItemKind.Operator },
  { label: "pow", detail: "** (exponentiation)", documentation: "べき乗。`a pow b` → `a ** b`", kind: CompletionItemKind.Operator },
  { label: "neg", detail: "- (unary negation)", documentation: "単項否定。`neg x` → `-x`", kind: CompletionItemKind.Operator },

  // Comparison Operators
  { label: "eq", detail: "=== (strict equality)", documentation: "厳密等価。`a eq b` → `a === b`", kind: CompletionItemKind.Operator },
  { label: "neq", detail: "!== (strict inequality)", documentation: "厳密不等価。`a neq b` → `a !== b`", kind: CompletionItemKind.Operator },
  { label: "lt", detail: "< (less than)", documentation: "未満。`a lt b` → `a < b`", kind: CompletionItemKind.Operator },
  { label: "gt", detail: "> (greater than)", documentation: "超過。`a gt b` → `a > b`", kind: CompletionItemKind.Operator },
  { label: "le", detail: "<= (less or equal)", documentation: "以下。`a le b` → `a <= b`", kind: CompletionItemKind.Operator },
  { label: "ge", detail: ">= (greater or equal)", documentation: "以上。`a ge b` → `a >= b`", kind: CompletionItemKind.Operator },

  // Logical Operators
  { label: "and", detail: "&& (logical AND)", documentation: "論理積。`a and b` → `a && b`", kind: CompletionItemKind.Operator },
  { label: "or", detail: "|| (logical OR)", documentation: "論理和。`a or b` → `a || b`", kind: CompletionItemKind.Operator },
  { label: "not", detail: "! (logical NOT)", documentation: "論理否定。`not x` → `!x`", kind: CompletionItemKind.Operator },
  { label: "pipe", detail: "| (pipe operator)", documentation: "パイプ演算子。左の値を右の関数に渡す。`x pipe f` → `f(x)`", kind: CompletionItemKind.Operator },

  // Conditionals
  { label: "if", detail: "if", documentation: "条件分岐。後置形式も可: `stmt if cond`", kind: CompletionItemKind.Keyword },
  { label: "elif", detail: "else if", documentation: "else if 分岐。`elif cond` → `else if (cond)`", kind: CompletionItemKind.Keyword },
  { label: "else", detail: "else", documentation: "else 分岐", kind: CompletionItemKind.Keyword },
  { label: "unless", detail: "if (!(cond))", documentation: "反転条件分岐。条件が false のとき実行。`unless cond` → `if (!(cond))`", kind: CompletionItemKind.Keyword },
  { label: "then", detail: "? (ternary)", documentation: "三項演算子。`cond then a else b` → `cond ? a : b`", kind: CompletionItemKind.Keyword },

  // Loops
  { label: "while", detail: "while", documentation: "条件が true の間ループ。`while cond` → `while (cond)`", kind: CompletionItemKind.Keyword },
  { label: "until", detail: "while (!(cond))", documentation: "条件が true になるまでループ（while の逆）", kind: CompletionItemKind.Keyword },
  { label: "for", detail: "for...of", documentation: "イテラブルを反復。`for x in list` → `for (const x of list)`. インデックス付き: `for i; x in list`", kind: CompletionItemKind.Keyword },
  { label: "in", detail: "of (in for loop)", documentation: "for ループ内でイテラブルを指定。`for x in list`", kind: CompletionItemKind.Keyword },
  { label: "range", detail: "numeric range", documentation: "数値範囲ループ。`for x in range start; end` → `for (let x = start; x < end; x++)`", kind: CompletionItemKind.Keyword },
  { label: "break", detail: "break", documentation: "現在のループを抜ける", kind: CompletionItemKind.Keyword },
  { label: "continue", detail: "continue", documentation: "次のループ反復にスキップ", kind: CompletionItemKind.Keyword },

  // Pattern Matching
  { label: "match", detail: "match (pattern matching)", documentation: "パターンマッチ。`match expr` の後に `when` アームを記述", kind: CompletionItemKind.Keyword },
  { label: "when", detail: "when (match arm)", documentation: "マッチアーム。`when value` → `if (subject === value)`", kind: CompletionItemKind.Keyword },

  // Error Handling
  { label: "try", detail: "try", documentation: "try ブロック", kind: CompletionItemKind.Keyword },
  { label: "catch", detail: "catch", documentation: "catch ブロック。`catch err` → `catch (err)`", kind: CompletionItemKind.Keyword },
  { label: "finally", detail: "finally", documentation: "finally ブロック", kind: CompletionItemKind.Keyword },
  { label: "throw", detail: "throw", documentation: "例外をスローする", kind: CompletionItemKind.Keyword },

  // Modules
  { label: "import", detail: "import", documentation: "ES モジュールからインポート。`import name from ///path///` → `import name from \"path\"`", kind: CompletionItemKind.Keyword },
  { label: "from", detail: "from", documentation: "import/use 構文の一部", kind: CompletionItemKind.Keyword },
  { label: "export", detail: "export", documentation: "宣言をエクスポート。`export fn name` → `export function name`", kind: CompletionItemKind.Keyword },
  { label: "default", detail: "default", documentation: "デフォルトエクスポート。`export default fn name`", kind: CompletionItemKind.Keyword },
  { label: "require", detail: "require (CJS)", documentation: "CommonJS インポート。`import name require ///path///` → `const name = require(\"path\")`", kind: CompletionItemKind.Keyword },
  { label: "use", detail: "use (named import)", documentation: "名前付きインポート。`from mod.path use name1, name2`", kind: CompletionItemKind.Keyword },
  { label: "namespace", detail: "namespace (IIFE)", documentation: "名前空間を宣言。IIFE にコンパイルされる。`namespace mymod` → `const mymod = (() => { ... })()`", kind: CompletionItemKind.Keyword },
  { label: "pub", detail: "export (public)", documentation: "宣言を公開/エクスポートする。`pub fn name` → `export function name`", kind: CompletionItemKind.Keyword },
  { label: "all", detail: "* as (namespace import)", documentation: "名前空間インポート。`import all as ns from ///path///`", kind: CompletionItemKind.Keyword },

  // Type System
  { label: "is", detail: "typeof/instanceof", documentation: "型チェック。`x is string` → `typeof x === \"string\"`. `x is MyClass` → `x instanceof MyClass`", kind: CompletionItemKind.Operator },
  { label: "as", detail: "(type cast)", documentation: "型キャスト注釈（コンパイル時に無視される）", kind: CompletionItemKind.Keyword },
  { label: "of", detail: "(type annotation)", documentation: "型注釈。`const x of number be 5`（コンパイル時に無視される）", kind: CompletionItemKind.Keyword },
  { label: "typeof", detail: "typeof", documentation: "JavaScript の typeof 演算子", kind: CompletionItemKind.Operator },
  { label: "instanceof", detail: "instanceof", documentation: "JavaScript の instanceof 演算子", kind: CompletionItemKind.Operator },
  { label: "type", detail: "type (alias)", documentation: "型エイリアスを宣言（JS出力なし）。`type MyNum be number`", kind: CompletionItemKind.Keyword },

  // Literals
  { label: "true", detail: "true", documentation: "真偽値 true", kind: CompletionItemKind.Value },
  { label: "false", detail: "false", documentation: "真偽値 false", kind: CompletionItemKind.Value },
  { label: "null", detail: "null", documentation: "null リテラル", kind: CompletionItemKind.Value },
  { label: "nil", detail: "null (alias)", documentation: "null のエイリアス（`null` の使用を推奨）", kind: CompletionItemKind.Value },
  { label: "undefined", detail: "undefined", documentation: "undefined リテラル", kind: CompletionItemKind.Value },

  // OOP / Reference
  { label: "new", detail: "new", documentation: "インスタンスを生成。`new Foo[args]` → `new Foo(args)`", kind: CompletionItemKind.Keyword },
  { label: "delete", detail: "delete", documentation: "プロパティを削除。`delete obj.key` → `delete obj.key`", kind: CompletionItemKind.Keyword },
  { label: "this", detail: "this", documentation: "現在のオブジェクトへの参照", kind: CompletionItemKind.Keyword },
  { label: "await", detail: "await", documentation: "async fn 内で Promise を待機する", kind: CompletionItemKind.Keyword },

  // Collection Literals
  { label: "list", detail: "[...] (array)", documentation: "配列リテラル。`list [a, b, c]` → `[a, b, c]`", kind: CompletionItemKind.Keyword },
  { label: "object", detail: "{...} (object)", documentation: "オブジェクトリテラル。`object [key be value]` → `{ key: value }`", kind: CompletionItemKind.Keyword },
];

export function getCompletionItems(): CompletionItem[] {
  return keywords.map((kw, i) => ({
    label: kw.label,
    kind: kw.kind,
    detail: kw.detail,
    documentation: kw.documentation,
    data: i,
  }));
}

export function getKeywordInfo(word: string): KeywordInfo | undefined {
  return keywords.find((kw) => kw.label === word);
}
