/* eslint-disable no-shadow */
'(def x 2)(def y 3)(def z (+ x y))'

const context = new Map();

const body = (context) => {
  context.def('x', 2);
  context.def('y', 5);
  return context.def('z', ((outer) => {
    const context = outer;
    return context.resolve('+').apply(null, [context.resolve('x'), context.resolve('y')]);
  }).apply(null, [context]));
};

console.log(body);