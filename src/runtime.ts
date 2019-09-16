import { createContext as vmCreateContext, runInContext, Context as vmContext } from 'vm';
import { JoSymbol, Keyword } from './core';

type Value = number | boolean | null | Keyword | JoSymbol;

class Context {
  parents: Array<Context>;
  bindings: Map<string, Value>;

  constructor(...parents: Array<Context>) {
    this.parents = parents;
    this.bindings = new Map();
  }

  define(key: string, value: Value): Context {
    this.bindings.set(key, value);
    return this;
  }

  defineAll(keys: Array<string>, values: Array<Value>) {
    return keys.reduce((context, key, i) => context.define(key, values[i]), this);
  }

  resolve(key: string): Value | undefined {
    const value = this.bindings.get(key);
    if (value !== undefined) {
      return value;
    }
    if (this.parents !== null) {
      // eslint-disable-next-line no-restricted-syntax
      for (const parent of this.parents) {
        const value = parent.resolve(key);
        if (value !== undefined) {
          return value;
        }
      }
    }
    return undefined;
  }

  keyword(name: string): Keyword {
    throw "TODO";
  }

  build(): Context {
    return new Context(this);
  }
}

const truthy = (value : Value) => {
  switch (value) {
    // TODO undefined as well?
    case false: return false;
    case null: return false;
    default: return true;
  }
};

export const createContext = () => {
  const vars = new Context();
  const sandbox = { vars, bindings: vars };
  return vmCreateContext(sandbox);
};

export const evalCode = (code: string, context: vmContext | undefined): any => {
  return runInContext(code, context || createContext());
}