'use strict';

const repl = require('./repl');

test('compile', () => {
    expect(repl.compile('(+ 1 2)')).toStrictEqual([{type: "SYMBOL", name: "+"}, 1, 2]);
});

test('eval', () => {
    const context = repl.buildContext(new Map([["foo", 2]]));
    expect(repl.eval(context, '2')).toStrictEqual(2);
    expect(repl.eval(context, 'foo')).toStrictEqual(2);
    expect(repl.eval(context, '(def foo 3)')).toStrictEqual(null);
});
