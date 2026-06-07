import * as path from 'path';
import { LanguageConfig, Language } from './types';

const isWindows = process.platform === 'win32';

export const LANGUAGE_CONFIGS: Record<Language, LanguageConfig> = {
  C: {
    extension: '.c',
    needsCompilation: true,
    compile: (codePath, outputPath, compilerPath) => ({
      cmd: compilerPath || 'gcc',
      args: [codePath, '-o', isWindows ? `${outputPath}.exe` : outputPath, '-lm', '-O2', '-std=c11'],
    }),
    run: (compiledPath) => ({
      cmd: isWindows ? `${compiledPath}.exe` : compiledPath,
      args: [],
    }),
  },

  CPP: {
    extension: '.cpp',
    needsCompilation: true,
    compile: (codePath, outputPath, compilerPath) => ({
      cmd: compilerPath || 'g++',
      args: [codePath, '-o', isWindows ? `${outputPath}.exe` : outputPath, '-lm', '-O2', '-std=c++17'],
    }),
    run: (compiledPath) => ({
      cmd: isWindows ? `${compiledPath}.exe` : compiledPath,
      args: [],
    }),
  },

  JAVA: {
    extension: '.java',
    needsCompilation: true,
    compile: (codePath, _outputPath, compilerPath) => ({
      cmd: compilerPath || 'javac',
      args: [codePath],
    }),
    run: (compiledPath) => {
      const dir = path.dirname(compiledPath);
      const className = path.basename(compiledPath, '.java');
      return {
        cmd: 'java',
        args: ['-cp', dir, className],
      };
    },
  },

  PYTHON: {
    extension: '.py',
    needsCompilation: false,
    run: (codePath, compilerPath) => ({
      // Windows 通常是 "python"，Unix 是 "python3"
      cmd: compilerPath || (isWindows ? 'python' : 'python3'),
      args: [codePath],
    }),
  },

  NODEJS: {
    extension: '.js',
    needsCompilation: false,
    run: (codePath, compilerPath) => ({
      cmd: compilerPath || 'node',
      args: [codePath],
    }),
  },
};