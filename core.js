'use strict';

const symbol_re = "[a-zA-Z\-_?!*+<>=/][a-zA-Z\-_?!*+<>=/0-9']*";

const token_types = [
  ["LPAREN", "\\("],
  ["RPAREN", "\\)"],
  ["WHITESPACE", "\\s+"],
  ["INTEGER", "-?\\d+"],
  ["BOOLEAN", "true|false"],
  ["NIL", "nil"],
  ["KEYWORD", ":" + symbol_re],
  ["SYMBOL", symbol_re],
].map(([name, re]) => ({ name: name, re: new RegExp("^" + re)}));

const tokenize = (s) => {
  let results = [];
  let offset = 0;
  while (offset < s.length) {
    let matched = false;
    for (const {name, re} of token_types) {
      const [match] = re.exec(s.substr(offset)) || [];
      if (match != null) {
        results.push([name, match]);
        offset = offset + match.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw { msg: "Invalid syntax", offset: offset, s: s };
    }
  }
  return results;
};

const consIter = (head, tail) => {
  let seen_head = false;
  return {
    next: () => {
      if (!seen_head) {
        seen_head = true;
        return { done: false, value: head };
      } else {
        return tail.next();
      }
    }
  };
}

const compileListForm = (tokens) => {
  let list = [];
  while (true) {
    const next = tokens.next();
    if (next.done) {
      throw { msg: "Invalid list form: did not terminate" };
    }
    const [name, value] = next.value;
    switch (name) {
    case "RPAREN": return list;
    default:
      list.push(compileForm(consIter(next.value, tokens)));
    }
  }
};

const compileForm = (tokens) => {
  while (true) {
    const next = tokens.next();
    if (next.done) {
      throw { msg: "No tokens to compile for form" };
    }
    const [name, value] = next.value;
    switch (name) {
      case "INTEGER": return Number(value);
      case "BOOLEAN": return value === "true";
      case "NIL": return null;
      case "KEYWORD": return { type: name, name: value };
      case "SYMBOL": return { type: name, name: value };
      case "WHITESPACE": continue;
      case "LPAREN": return compileListForm(tokens);
    }
    throw { msg: "Unexpected token", name, value };
  }
};

const compile = (s) => {
  const tokens = tokenize(s);
  const iterator = tokens[Symbol.iterator]();
  return compileForm(iterator);
};

class Context {
  constructor(...parents) {
    this.parents = parents;
    this.bindings = new Map();
  }
  
  define(key, value) {
    this.bindings.set(key, value);
    return null;
  }
  
  defineAll(keys, values) {
    keys.reduce((accum, key, i) => this.define(key, values[i]), null);
  }

  resolve(key) {
    if (this.bindings.has(key)) {
      return this.bindings.get(key);
    }
    if (this.parents != null) {
      for (const parent of this.parents) {
        const value = parent.resolve(key);
        if (value != null) {
          return value;
        }
      }
    }
    throw { msg: "Undefined binding", key, context: this };
  }
}

const buildFn = (f) => ({type: "FN", apply: f});

const buildMacro = (args, body) => ({
  type: "MACRO", args, body});

const truthy = (value) => {
  switch (value) {
    case false: return false;
    case null: return false;
    default: return true;
  }
};

const partition = (seq, size) => {
  if (seq.length % size != 0) {
    throw {msg: "invalid partition", seq, size};
  }
  return seq.reduce((accum, x, i) => {
    if (i % size == 0) {
      accum.push([x]);
    } else {
      accum[accum.length - 1].push(x);
    }
    return accum;
  }, []);
};

const compare = (op, seq) => {
  if (seq.length == 0) {
    throw {msg: "empty compare seq", op, seq};
  }
  {
    const last_type = seq[0];
    for (const i=1; i<seq.last; i++) {
      if (last_type !== typeof value) {
        throw {msg: "invalid compare seq", op, seq};
      }
    }
  }
  let comp_pred = null;
  switch (op) {
    case ">=":
      comp_pred = (x, y) => x >= y;
      break;
    case ">": {
      comp_pred = (x, y) => x > y;
      break;
    }
    case "=": {
      comp_pred = (x, y) => x == y;
      break;
    }
    case "<": {
      comp_pred = (x, y) => x < y;
      break;
    }
    case "<=": {
      comp_pred = (x, y) => x <= y;
      break;
    }
    default: {
      throw {msg: "Invalid compare op", op, seq};
    }
  }
  let marker = seq[0];
  for (let i=1; i<seq.length; i++) {
    const value = seq[i];
    if (comp_pred(marker, value)) {
      marker = value;
    } else {
      return false;
    }
  }
  return true;
};

// TODO implement as loop as optimization
const evalForm = (context, form) => {
  if (Array.isArray(form)) {
    const [first, ...args] = form;
    if (first.type == "SYMBOL") {
      // special forms
      switch (first.name) {
        case "def": {
          const [def_symbol, value] = args;
          context.define(def_symbol.name, evalForm(context, value));
          return null;
        }
        case "defmacro": {
          const [def_symbol, macro_args, body] = args;
          context.define(def_symbol.name, buildMacro(macro_args, body));
          return null;
        }
        case "fn": {
          const [fn_args, body] = args;
          return buildFn((call_context, call_args) => {
            const apply_context = new Context(context, call_context);
            apply_context.defineAll(fn_args.map((sym) => sym.name), call_args);
            return evalForm(apply_context, body);
          });
        }
        case "if": {
          const [cond, positive, negative] = args;
          const chosen_form = truthy(evalForm(context, cond)) ? positive : negative;
          return evalForm(context, chosen_form);
        }
        case "let": {
          const [let_bindings, ...body] = args;
          const let_context = new Context(context);
          for (const [binding_symbol, binding_form] of partition(let_bindings, 2)) {
            let_context.define(binding_symbol.name, evalForm(let_context, binding_form));
          }
          return body.reduce((accum, body_form) => evalForm(let_context, body_form), null);
        }
        case "quote": {
          const [quoted_form] = args;
          return quoted_form;
        }
        case "eval": {
          const [eval_form] = args;
          return evalForm(context, evalForm(context, eval_form));
        }
      }
    }
    const value = evalForm(context, first);
    switch (value.type) {
      case "FN":
        const fn_args = args.map((arg) => evalForm(context, arg));
        return value.apply(context, fn_args);
      case "MACRO":
        const macro_args = value.args;
        const macro_body = value.body;
        const eval_context = new Context(context);
        eval_context.defineAll(macro_args.map((sym) => sym.name), args);
        return evalForm(eval_context, macro_body);
      default:
        throw { msg: "Invalid callable value", value, form };
    }
  } else if (form.type == "SYMBOL") {
    return context.resolve(form.name);
  } else {
    return form;
  }
};

const evalString = (context, s) => evalForm(context, compile(s));

const buildContext = (root, bindings) => {
  const context = root || new Context();
  if (bindings != null) {
    for (const [name, value] of bindings) {
      context.define(name, value);
    }
  }
  return context;
};

const standardBindings = new Map([
  // TODO consider asserting all args are of number type, or at least the same type
  ["+", buildFn((context, args) => args.reduce((accum, value) => accum + value, 0))],
  ["*", buildFn((context, args) => args.reduce((accum, value) => accum * value, 1))],
  [">=", buildFn((context, args) => compare(">=", args))],
  [">", buildFn((context, args) => compare(">", args))],
  ["=", buildFn((context, args) => compare("=", args))],
  ["<", buildFn((context, args) => compare("<", args))],
  ["<=", buildFn((context, args) => compare("<=", args))],
]);

const buildStandardContext = (bindings) => {
  return buildContext(buildContext(null, standardBindings), bindings);
};

module.exports = { compile, buildStandardContext, eval: evalString };
