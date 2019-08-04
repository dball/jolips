'use strict';

const symbol_re = "[^\p{Z}\p{C}\s\(\)]";

const token_types =
      [["LPAREN", "\\("],
       ["RPAREN", "\\)"],
       ["WHITESPACE", "\\s+"],
       ["INTEGER", "-?\\d+"],
       ["BOOLEAN", "true|false"],
       ["NIL", "nil"],
       ["KEYWORD", ":" + symbol_re],
       ["SYMBOL", symbol_re],
      ];

const tokenize = (s) => {
    // TODO why can't I shadow token_types?
    const my_token_types = token_types.map(
	([name, re]) =>	({ name: name, re: new RegExp("^" + re)}));
    let results = [];
    let offset = 0;
    while (offset < s.length) {
	let matched = false;
	for (const {name, re} of my_token_types) {
	    re.lastIndex = offset;
	    const [match] = re.exec(s.substr(offset)) || [];
	    if (match != null) {
		results.push([name, match]);
		offset = offset + match.length;
		matched = true;
		break;
	    }
	}
	if (!matched) {
	    throw { msg: "Invalid syntax", offset: offset };
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
	case "KEYWORD": return { type: name, value: value };
	case "SYMBOL": return { type: name, value: value };
	case "WHITESPACE": continue;
	case "LPAREN": return compileListForm(tokens);
	}
	throw { msg: "Unexpected token", name: name, value: value };
    }
};

const compile = (s) => {
    const tokens = tokenize(s);
    const iterator = tokens[Symbol.iterator]();
    return compileForm(iterator);
}

console.log(compile("  true"));
console.log(compile("(+ 1 2)"));

/*
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("j> ", (line) => {
    console.log(line);
    rl.close();
});
*/
