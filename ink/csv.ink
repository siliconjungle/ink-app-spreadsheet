module csv_recovery;
// A strict, table-driven CSV/TSV tokenizer with one learnable hole.
//
// `authored` is RFC 4180: it returns None exactly where a strict parser must
// give up (a quote inside an unquoted field, text after a closing quote, end of
// input inside quotes). The `recover` hole fills only those entries, so any
// file the strict table accepts parses exactly as before. Recovered steps are
// reported by row so the app can tell the user what it repaired.
enum State { FieldStart, Unquoted, Quoted, AfterQuote, }
enum Class { Quote, Delimiter, Newline, Return, Other, End, }
// What to do with the current byte:
// Text/Quoted append it (leaving the field unquoted or quoted), Open/Close skip
// a quote, Field ends a field, Row ends a row, Skip ignores the byte, Requote
// restores the quote that was taken as closing and appends the byte.
enum Move { Text, Quoted, Open, Close, Field, Row, Skip, Requote, }

fn classify(text: String, i: u32, delimiter: u32) -> Class {
  return string_byte_at(text, i).fold(
    fn(b)=>choose(b == 34, Class.Quote, choose(b == delimiter, Class.Delimiter,
      choose(b == 10, Class.Newline, choose(b == 13, Class.Return, Class.Other)))),
    fn(none)=>Class.End);
}

fn authored(s: State, c: Class) -> Option<Move> {
  if s == State.FieldStart {
    if c == Class.Quote { return Some(Move.Open); }
    if c == Class.Delimiter { return Some(Move.Field); }
    if c == Class.Newline || c == Class.End { return Some(Move.Row); }
    if c == Class.Return { return Some(Move.Skip); }
    return Some(Move.Text);
  }
  if s == State.Unquoted {
    if c == Class.Delimiter { return Some(Move.Field); }
    if c == Class.Newline || c == Class.End { return Some(Move.Row); }
    if c == Class.Return { return Some(Move.Skip); }
    if c == Class.Other { return Some(Move.Text); }
    return None;
  }
  if s == State.Quoted {
    if c == Class.Quote { return Some(Move.Close); }
    if c == Class.End { return None; }
    return Some(Move.Quoted);
  }
  if c == Class.Quote { return Some(Move.Quoted); }
  if c == Class.Delimiter { return Some(Move.Field); }
  if c == Class.Newline || c == Class.End { return Some(Move.Row); }
  if c == Class.Return { return Some(Move.Skip); }
  return None;
}

fn decide(s: State, c: Class) -> Move {
  return authored(s, c).unwrap_or(learn recover(s, c): choice<Move>);
}

record Parser {
  state: State, field: String, open: Bool, start: u32,
  row: List<String>, rows: List<List<String>>, count: u32, recovered: List<u32>,
}
record Parsed { rows: List<List<String>>, recovered: List<u32>, }

// Pending bytes [start, i) are copied as one slice; slices only end at ASCII
// structure bytes, so multi-byte UTF-8 characters are never split.
fn flush(p: Parser, text: String, i: u32) -> String {
  return choose(p.open, string_concat(p.field, string_slice(text, p.start, i).fold(fn(s)=>s, fn(none)=>"")), p.field);
}

fn advance(p: Parser, text: String, delimiter: u32, i: u32) -> Parser {
  let c = classify(text, i, delimiter);
  let m = decide(p.state, c);
  let learned = authored(p.state, c).fold(fn(v)=>false, fn(none)=>true);
  let recovered = choose(learned, p.recovered.concat([p.count]), p.recovered);
  if m == Move.Text || m == Move.Quoted {
    return Parser{..p, state: choose(m == Move.Text, State.Unquoted, State.Quoted),
      open: true, start: choose(p.open, p.start, i), recovered: recovered};
  }
  let field = flush(p, text, i);
  if m == Move.Requote {
    return Parser{..p, state: State.Quoted, field: string_concat(field, "\""), open: true, start: i, recovered: recovered};
  }
  if m == Move.Open { return Parser{..p, state: State.Quoted, field: field, open: false, recovered: recovered}; }
  if m == Move.Close { return Parser{..p, state: State.AfterQuote, field: field, open: false, recovered: recovered}; }
  if m == Move.Skip { return Parser{..p, field: field, open: false, recovered: recovered}; }
  if m == Move.Field {
    return Parser{..p, state: State.FieldStart, field: "", open: false, row: p.row.concat([field]), recovered: recovered};
  }
  let nothing = c == Class.End && length(p.row) == 0 && field == "";
  let none: List<String> = [];
  return Parser{..p, state: State.FieldStart, field: "", open: false, row: none,
    rows: choose(nothing, p.rows, p.rows.concat([p.row.concat([field])])), count: choose(nothing, p.count, p.count + 1), recovered: recovered};
}

fn parse_text(text: String, delimiter: u32) -> Parsed {
  let rows: List<List<String>> = [];
  let row: List<String> = [];
  let recovered: List<u32> = [];
  let initial = Parser{state: State.FieldStart, field: "", open: false, start: 0, row: row, rows: rows, count: 0, recovered: recovered};
  let done = repeat_until(string_byte_len(text) + 1, initial, fn(p)=>false, fn(i)=>fn(p)=>advance(p, text, delimiter, i));
  return Parsed{rows: done.rows, recovered: done.recovered};
}

// The whole file; `recovered` holds the row index of every repaired step.
query parse(text: String, delimiter: u32) -> Parsed { return parse_text(text, delimiter); }

record Labelled { text: String, delimiter: u32, cells: List<List<String>>, }
record Tally { at: u32, errors: f32, }
fn row_errors(got: List<List<String>>, want: List<List<String>>) -> f32 {
  let none: List<String> = [];
  let tally = foldl(want, Tally{at: 0, errors: 0.0}, fn(w)=>fn(t)=>
    Tally{at: t.at + 1, errors: t.errors + choose(got.at_or(t.at, none) == w, 0.0, 1.0)});
  return tally.errors + choose(length(got) == length(want), 0.0, 1.0);
}
// Rows that differ from the intended grid, summed over labelled broken files.
objective recovery(cases: List<Labelled>) -> f32 {
  return foldl(cases, 0.0, fn(c)=>fn(total)=>total + row_errors(parse_text(c.text, c.delimiter).rows, c.cells));
}
