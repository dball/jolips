/* eslint-disable max-classes-per-file */
const symbolRe = "[a-zA-Z\-_?!*+<>=/][a-zA-Z\-_?!*+<>=/0-9']*";

const tokenTypes = [
  ['LPAREN', '\\('],
  ['RPAREN', '\\)'],
  ['WHITESPACE', '\\s+'],
  ['INTEGER', '-?\\d+'],
  ['BOOLEAN', 'true|false'],
  ['NIL', 'nil'],
  ['KEYWORD', `:${symbolRe}`],
  ['SYMBOL', symbolRe],
].map(([name, re]) => ({ name, re: new RegExp(`^${re}`) }));

class Ex extends Error {
  data: object;

  constructor(message: string, data = {}) {
    super(message);
    this.data = data;
  }
}

const tokenize = (s: string) => {
  const results = [];
  let offset = 0;
  const consume = (tokenType) => {
    const { name, re } = tokenType;
    const [match] = re.exec(s.substr(offset)) || [];
    if (match != null) {
      results.push([name, match]);
      offset += match.length;
      return true;
    }
    return false;
  };
  while (offset < s.length) {
    const matched = tokenTypes.some(consume);
    if (!matched) {
      throw new Ex('Invalid syntax', { offset, s });
    }
  }
  return results;
};

const consIter = (head: any, tail) => {
  let seenHead = false;
  return {
    next: () => {
      if (!seenHead) {
        seenHead = true;
        return { done: false, value: head };
      }
      return tail.next();
    },
  };
};

const parseListForm = (tokens) => {
  const list = [];
  let terminated = false;
  do {
    const next = tokens.next();
    if (next.done) {
      throw new Ex('Invalid list form: did not terminate');
    }
    const [name] = next.value;
    switch (name) {
      case 'RPAREN':
        terminated = true;
        break;
      default:
        // eslint-disable-next-line no-use-before-define
        list.push(parseForm(consIter(next.value, tokens)));
    }
  } while (!terminated);
  return list;
};

const parseForm = (tokens) => {
  let form;
  do {
    const next = tokens.next();
    if (next.done) {
      throw new Ex('No tokens to compile for form');
    }
    const [name, value] = next.value;
    switch (name) {
      case 'INTEGER':
        form = Number(value);
        break;
      case 'BOOLEAN':
        form = value === 'true';
        break;
      case 'NIL':
        form = null;
        break;
      case 'KEYWORD':
        form = { type: name, name: value };
        break;
      case 'SYMBOL':
        form = { type: name, name: value };
        break;
      case 'WHITESPACE':
        break;
      case 'LPAREN':
        form = parseListForm(tokens);
        break;
      default:
        throw new Ex('Invalid token type', { name, value });
    }
  } while (form === undefined);
  return form;
};

const parse = (s) => {
  const tokens = tokenize(s);
  const iterator = tokens[Symbol.iterator]();
  return parseForm(iterator);
};

class Context {
  parents: any;
  bindings: any;

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
      // eslint-disable-next-line no-restricted-syntax
      for (const parent of this.parents) {
        const value = parent.resolve(key);
        if (value !== undefined) {
          return value;
        }
      }
    }
    throw new Ex('Undefined binding', { key, context: this });
  }
}

const buildFn = (f) => ({ type: 'FN', apply: f });

const buildMacro = (args, body) => ({
  type: 'MACRO', args, body,
});

const truthy = (value) => {
  switch (value) {
    case false: return false;
    case null: return false;
    default: return true;
  }
};

const partition = (seq, size) => {
  if (seq.length % size !== 0) {
    throw new Ex('invalid partition', { seq, size });
  }
  return seq.reduce((accum, x, i) => {
    if (i % size === 0) {
      accum.push([x]);
    } else {
      accum[accum.length - 1].push(x);
    }
    return accum;
  }, []);
};

const compare = (op, seq) => {
  if (seq.length === 0) {
    throw new Ex('empty compare seq', { op, seq });
  }
  {
    const firstType = seq[0];
    for (let i = 1; i < seq.last; i += 1) {
      // eslint-disable-next-line valid-typeof
      if (firstType !== typeof seq[i]) {
        throw new Ex('invalid compare seq', { op, seq });
      }
    }
  }
  let compPred = null;
  switch (op) {
    case '>=':
      compPred = (x, y) => x >= y;
      break;
    case '>': {
      compPred = (x, y) => x > y;
      break;
    }
    case '=': {
      // eslint-disable-next-line eqeqeq
      compPred = (x, y) => x == y;
      break;
    }
    case '<': {
      compPred = (x, y) => x < y;
      break;
    }
    case '<=': {
      compPred = (x, y) => x <= y;
      break;
    }
    default: {
      throw new Ex('Invalid compare op', { op, seq });
    }
  }
  let marker = seq[0];
  for (let i = 1; i < seq.length; i += 1) {
    const value = seq[i];
    if (compPred(marker, value)) {
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
    if (first.type === 'SYMBOL') {
      // special forms
      switch (first.name) {
        case 'def': {
          const [defSymbol, value] = args;
          context.define(defSymbol.name, evalForm(context, value));
          return null;
        }
        case 'defmacro': {
          const [defSymbol, macroArgs, body] = args;
          context.define(defSymbol.name, buildMacro(macroArgs, body));
          return null;
        }
        case 'fn': {
          const [fnArgs, body] = args;
          return buildFn((callContext, callArgs) => {
            const applyContext = new Context(context, callContext);
            applyContext.defineAll(fnArgs.map((sym) => sym.name), callArgs);
            return evalForm(applyContext, body);
          });
        }
        case 'if': {
          const [cond, positive, negative] = args;
          const chosenForm = truthy(evalForm(context, cond)) ? positive : negative;
          return evalForm(context, chosenForm);
        }
        case 'let': {
          const [letBindings, ...body] = args;
          const letContext = new Context(context);
          // eslint-disable-next-line no-restricted-syntax
          for (const [bindingSymbol, bindingForm] of partition(letBindings, 2)) {
            letContext.define(bindingSymbol.name, evalForm(letContext, bindingForm));
          }
          return body.reduce((accum, bodyForm) => evalForm(letContext, bodyForm), null);
        }
        case 'quote': {
          const [quotedForm] = args;
          return quotedForm;
        }
        case 'eval': {
          const [evalingForm] = args;
          return evalForm(context, evalForm(context, evalingForm));
        }
        default: break;
      }
    }
    const value = evalForm(context, first);
    switch (value.type) {
      case 'FN': {
        const fnArgs = args.map((arg) => evalForm(context, arg));
        return value.apply(context, fnArgs);
      }
      case 'MACRO': {
        const macroArgs = value.args;
        const macroBody = value.body;
        const evalContext = new Context(context);
        evalContext.defineAll(macroArgs.map((sym) => sym.name), args);
        return evalForm(evalContext, macroBody);
      }
      default:
        throw new Ex('Invalid callable value', { value, form });
    }
  } else if (form.type === 'SYMBOL') {
    return context.resolve(form.name);
  } else {
    return form;
  }
};

const evalString = (context, s) => evalForm(context, parse(s));

const buildContext = (root, bindings) => {
  const context = root || new Context();
  if (bindings != null) {
    // eslint-disable-next-line no-restricted-syntax
    for (const [name, value] of bindings) {
      context.define(name, value);
    }
  }
  return context;
};

const standardBindings = new Map([
  // TODO consider asserting all args are of number type, or at least the same type
  ['+', buildFn((context, args) => args.reduce((accum, value) => accum + value, 0))],
  ['*', buildFn((context, args) => args.reduce((accum, value) => accum * value, 1))],
  ['>=', buildFn((context, args) => compare('>=', args))],
  ['>', buildFn((context, args) => compare('>', args))],
  ['=', buildFn((context, args) => compare('=', args))],
  ['<', buildFn((context, args) => compare('<', args))],
  ['<=', buildFn((context, args) => compare('<=', args))],
]);

const buildStandardContext = (bindings) => {
  return buildContext(buildContext(null, standardBindings), bindings);
};

module.exports = { parse, buildStandardContext, eval: evalString };