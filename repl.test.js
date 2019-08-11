'use strict';

const repl = require('./repl');

test('compile', () => {
  expect(repl.compile('(+ 1 2)')).toStrictEqual([{type: "SYMBOL", name: "+"}, 1, 2]);
});

test('eval', () => {
  const context = repl.buildStandardContext(new Map([["foo", 2]]));
  const forms = [
    ['2', 2],
    ['foo', 2],
    ['(def foo 3)', null],
    ['foo', 3],
    ['(+ 1 2)', 3],
    ['(+ 1 (+ 1 1))', 3],
    ['(def inc (fn (x) (+ x 1)))', null],
    ['(inc 4)', 5],
    ['(if true 0 1)', 0],
    ['(let (x 1 y (+ x 10)) y)', 11],
    ['(let () 2 3)', 3],
    ['(defmacro test-when (cond body) (if (eval cond) (let () (eval body)) nil))', null],
    // TODO implement eval?
    //['(test-when true 23)', 23],
  ];
  for (const [form, expected] of forms) {
    expect(repl.eval(context, form)).toStrictEqual(expected);
  }
});
