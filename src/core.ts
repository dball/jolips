import { typeAlias } from "@babel/types";

/* eslint-disable max-classes-per-file */
class Ex extends Error {
  data: object;

  constructor(message: string, data = {}) {
    super(message);
    this.data = data;
  }
}

const symbolRe = "[a-zA-Z\-_?!*+<>=/][a-zA-Z\-_?!*+<>=/0-9']*";

enum TokenType {
  LPAREN,
  RPAREN,
  WHITESPACE,
  INTEGER,
  BOOLEAN,
  NIL,
  KEYWORD,
  SYMBOL,
}

interface TokenPattern {
  type: TokenType,
  re: RegExp,
}

const tokenStrings: Array<[TokenType, string]> =
  [[TokenType.LPAREN, '\\('],
  [TokenType.RPAREN, '\\)'],
  [TokenType.WHITESPACE, '\\s+'],
  [TokenType.INTEGER, '-?\\d+'],
  [TokenType.BOOLEAN, 'true|false'],
  [TokenType.NIL, 'nil'],
  [TokenType.KEYWORD, `:${symbolRe}`],
  [TokenType.SYMBOL, symbolRe],];

const tokenPatterns: Array<TokenPattern> =
  tokenStrings.map(([type, re]) => ({ type, re: new RegExp(`^${re}`) }));

interface Token {
  type: TokenType,
  source: string,
  offset: number,
}

const tokenize = (s: string): Array<Token> => {
  const results: Array<Token> = [];
  let offset = 0;
  const consume = (tokenPattern: TokenPattern) => {
    const { type, re } = tokenPattern;
    const [source] = re.exec(s.substr(offset)) || [null];
    if (source !== null) {
      results.push({ type, source, offset });
      offset += source.length;
      return true;
    }
    return false;
  };
  while (offset < s.length) {
    const matched = tokenPatterns.some(consume);
    if (!matched) {
      throw new Ex('Invalid syntax', { offset, s });
    }
  }
  return results;
};

// TODO is there a way to do this without a class? Does it matter?
class ConsIterator<T> implements IterableIterator<T> {
  private seenHead = false;

  constructor(private head: T, private tail: IterableIterator<T>) {}

  public next(): IteratorResult<T> {
    if (!this.seenHead) {
      this.seenHead = true;
      // TODO null out head so we don't keep it from gc?
      return { done: false, value: this.head };
    }
    return this.tail.next();
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this;
  }
}

type Keyword = { type: TokenType.KEYWORD, name: string };
type JoSymbol = { type: TokenType.SYMBOL, name: string };
// TODO Value is perhaps not the correct name for this type, since it doesn't contain
// fns or other runtime values, rather ast nodes. Is that the right name?
type Value = number | boolean | Keyword | JoSymbol | ValueArray;
interface ValueArray extends Array<Value> {}

const parseListForm = (tokens: IterableIterator<Token>) => {
  const list: Array<Value> = [];
  let terminated = false;
  do {
    const next = tokens.next();
    if (next.done) {
      throw new Ex('Invalid list form: did not terminate');
    }
    const token = next.value;
    switch (token.type) {
      case TokenType.RPAREN:
        terminated = true;
        break;
      default:
        // eslint-disable-next-line no-use-before-define
        list.push(parseForm(new ConsIterator(token, tokens)));
    }
  } while (!terminated);
  return list;
};

const parseForm = (tokens: IterableIterator<Token>) => {
  let form: Value;
  do {
    const next = tokens.next();
    if (next.done) {
      throw new Ex('No tokens to compile for form');
    }
    // TODO why does this need a type declaration in order to give context in vscode?
    const token = next.value;
    const { type, source } = token;
    switch (type) {
      case TokenType.INTEGER:
        form = Number(source);
        break;
      case TokenType.BOOLEAN:
        form = source === 'true';
        break;
      case TokenType.NIL:
        form = null;
        break;
      case TokenType.KEYWORD:
        form = { type, name: source };
        break;
      case TokenType.SYMBOL:
        form = { type, name: source };
        break;
      case TokenType.WHITESPACE:
        break;
      case TokenType.LPAREN:
        form = parseListForm(tokens);
        break;
      default:
        throw new Ex('Invalid token type', { token });
    }
  } while (form === undefined);
  return form;
};

const parse = (s: string) => {
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