'use strict';

const symbol_re = "[a-zA-Z\-_?!*+/][a-zA-Z\-_?!*+/0-9']*";

const token_types =
      [["LPAREN", "\\("],
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
    constructor(parent) {
	this.parent = parent;
	this.bindings = new Map();
    }

    define(symbol, value) {
	this.bindings.set(symbol.name, value);
	return null;
    }

    defineAll(symbols, values) {
	symbols.reduce((accum, symbol, i) => this.define(symbol, values[i]));
    }

    isDefined(symbol) {
	return this.bindings.has(symbol.name);
    }

    resolve(symbol) {
	if (this.isDefined(symbol)) {
	    return this.bindings.get(symbol.name);
	}
	if (this.parent != null) {
	    return this.parent.resolve(symbol);
	}
	throw { msg: "Undefined symbol", symbol, bindings: this.bindings };
    }
}

const evalForm = (context, form) => {
    if (Array.isArray(form)) {
	const [first, ...args] = form;
	if (first.type == "SYMBOL") {
	    // special forms
	    switch (first.name) {
	    case "def":
		const [def_symbol, value] = args;
		context.define(def_symbol, evalForm(context, value));
		return null;
	    case "fn":
		const [fn_args, body] = args;
		return {
		    type: "FN",
		    apply: (call_context, call_args) => {
			// TODO consider adding 'context' as the final fallback
			const apply_context = new Context(call_context);
			apply_context.defineAll(fn_args, call_args);
			return evalForm(apply_context, body);
		    }
		};
	    }
	}
	const value = evalForm(context, first);
	switch (value.type) {
	case "FN":
	    const fn_args = args.map((arg) => evalForm(context, arg));
	    return value.apply(context, fn_args);
	case "MACRO":
	    throw { msg: "TODO", form };
	default:
	    throw { msg: "Invalid callable value", value, form };
	}
    } else if (form.type == "SYMBOL") {
	return context.resolve(form);
    } else {
	return form;
    }
};

const evalString = (context, s) => evalForm(context, compile(s));

const buildContext = (bindings) => {
    const context = new Context();
    if (bindings != null) {
	for (const [name, value] of bindings) {
	    context.define({name}, value);
	}
    }
    return context;
};

/*
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const repl_context = new Context();

rl.question("j> ", (line) => {
    console.log(evalString(repl_context, line));
    rl.close();
});
*/

module.exports = { compile, buildContext, eval: evalString };
