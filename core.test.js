'use strict';

const core = require('./core');

test('compile', () => {
  expect(core.compile('(+ 1 2)')).toStrictEqual([{type: "SYMBOL", name: "+"}, 1, 2]);
});

test('eval', () => {
  const context = core.buildStandardContext(new Map([["foo", 2]]));
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
    ['(quote 2)', 2],
    ['(quote foo)', {type: "SYMBOL", name: "foo"}],
    ['(eval (quote 2))', 2],
    ['(eval (quote foo))', 3],
    ['(defmacro test-when (cond body) (if (eval cond) (let () (eval body)) nil))', null],
    ['(test-when true 23)', 23],
    ['(def huh? true)', null],
    ['(test-when huh? foo)', 3],
    ['(> 5 0 -5)', true],
    ['(> 5 0 10)', false],
    ['(= 0)', true],
    ['(def x 100)', null],
    ['(let (x 1000) (((fn (x) (fn (y) (+ x y))) 2) 3))', 5],
  ];
  for (const [form, expected] of forms) {
    expect(core.eval(context, form)).toStrictEqual(expected);
  }
});

test('eval limits', () => {
  const context = core.buildStandardContext(new Map());
});
