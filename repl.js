/* eslint-disable no-console */
const readline = require('readline');
const core = require('./core');

const context = core.buildStandardContext(new Map([
  ['*1', undefined],
  ['*2', undefined],
  ['*3', undefined],
  ['*e', undefined]]));

const repl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'j> ',
});

repl.on('line', (line) => {
  try {
    const value = core.eval(context, line);
    console.log(value);
    context.define('*3', context.resolve('*2'));
    context.define('*2', context.resolve('*1'));
    context.define('*1', value);
  } catch (error) {
    console.error(error);
    context.define('*e', error);
  }
  repl.prompt();
});

repl.on('close', process.exit);

repl.prompt();
