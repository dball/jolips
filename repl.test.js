'use strict';

const repl = require('./repl');

test('compile', () => {
    expect(repl.compile('(+ 1 2)')).toStrictEqual([{type: "SYMBOL", name: "+"}, 1, 2]);
});

test('eval', () => {
    expect(repl.eval(repl.buildContext(), '2')).toStrictEqual(2);
});
