//! Python's own rules for the few things the plugin's logic leans on, so the same numbers come out of the same Journal:
//! int(x or 0), float(x or 0), round() (half to even), and "falsy" JSON values.
use serde_json::Value;

/// Python's truthiness for a JSON value: None, 0, "", [] and {} are false.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|x| x != 0.0).unwrap_or(true),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

/// `int(v or 0)`.
pub fn int_or0(v: Option<&Value>) -> i64 {
    if !truthy(v) {
        return 0;
    }
    match v {
        Some(Value::Number(n)) => n.as_i64().unwrap_or_else(|| n.as_f64().map(|f| f.trunc() as i64).unwrap_or(0)),
        Some(Value::Bool(b)) => *b as i64,
        Some(Value::String(s)) => s.trim().parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

/// `float(v or 0)`.
pub fn float_or0(v: Option<&Value>) -> f64 {
    if !truthy(v) {
        return 0.0;
    }
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::Bool(b)) => *b as i64 as f64,
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

/// `str(v or "")`: the text of a string, "" for nothing (a number is written as Python would).
pub fn str_or_empty(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) if truthy(v) => n.to_string(),
        _ => String::new(),
    }
}

/// `str(v.get(k, "")).lower()`.
pub fn lower_str(e: &Value, k: &str) -> String {
    match e.get(k) {
        Some(Value::String(s)) => s.to_lowercase(),
        Some(Value::Null) => "none".into(),
        Some(v) => v.to_string().to_lowercase(),
        None => String::new(),
    }
}

/// `round(x)`: Python rounds a half to the even neighbour.
pub fn round(x: f64) -> i64 {
    x.round_ties_even() as i64
}

/// `round(num / den)` for whole numbers, as Python does it: the quotient is first made the nearest double (correctly rounded), then
/// rounded half to even. When both sides are small enough to be exact doubles that is one IEEE division, the same as Python's.
pub fn round_div(num: i128, den: i128) -> i64 {
    const EXACT: i128 = 1 << 53;
    if num.abs() < EXACT && den.abs() < EXACT {
        return round(num as f64 / den as f64);
    }
    // (beyond 2^53 an exact rational rounding is the closest we can say: rare, far above any real bounty)
    let (n, d) = (num, den);
    let q = n.div_euclid(d);
    let r = n.rem_euclid(d);
    let twice = 2 * r;
    (if twice > d || (twice == d && q % 2 != 0) { q + 1 } else { q }) as i64
}

// ------------------------------------------------------------------------------------------------ text, as Python writes it

/// `str(v)` for a JSON value: whole numbers without a dot, floats as Python's repr, None/True/False as Python spells them.
pub fn py_str(v: &Value) -> String {
    match v {
        Value::Null => "None".into(),
        Value::Bool(b) => if *b { "True".into() } else { "False".into() },
        Value::String(s) => s.clone(),
        Value::Number(n) => match n.as_i64() {
            Some(i) => i.to_string(),
            None => match n.as_u64() {
                Some(u) => u.to_string(),
                None => py_float_repr(n.as_f64().unwrap_or(f64::NAN)),
            },
        },
        other => other.to_string(),
    }
}

/// Python's repr(float).
pub fn py_float_repr(x: f64) -> String {
    if x.is_nan() {
        return "nan".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "inf".into() } else { "-inf".into() };
    }
    if x == 0.0 {
        return if x.is_sign_negative() { "-0.0".into() } else { "0.0".into() };
    }
    let sci = format!("{:e}", x); // shortest digits that round-trip: "1.5e-5", "1e16"
    let (mant, exp) = sci.split_once('e').unwrap();
    let exp: i32 = exp.parse().unwrap();
    if exp < -4 || exp >= 16 {
        let sign = if exp < 0 { '-' } else { '+' };
        return format!("{mant}e{sign}{:02}", exp.abs());
    }
    let s = format!("{}", x);
    if s.contains('.') { s } else { format!("{s}.0") }
}

/// A JSON number (or numeric text) as a float, as `float(v)` would take it; None where Python would raise.
pub fn as_float(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Number(n)) => n.as_f64(),
        Some(Value::Bool(b)) => Some(*b as i64 as f64),
        Some(Value::String(s)) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// `f"{x:.{nd}f}"`.
pub fn fmt_f(x: f64, nd: usize) -> String {
    format!("{:.*}", nd, x)
}

/// `f"{n:,}"` for a whole number.
pub fn group(n: i64) -> String {
    let s = n.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 { format!("-{out}") } else { out }
}

/// combat.py's num(): `f"{round(float(n)):,}"`, "0" for anything that is not a number.
pub fn num(v: Option<&Value>) -> String {
    match as_float(v) {
        Some(x) if x.is_finite() => group(round(x)),
        _ => "0".into(),
    }
}

/// `v.get(k)` as a number or 0: the `(x or 0)` of the plugin.
pub fn n_or0(v: Option<&Value>) -> f64 {
    if !truthy(v) {
        return 0.0;
    }
    as_float(v).unwrap_or(0.0)
}
