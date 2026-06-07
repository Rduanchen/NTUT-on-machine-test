import { CompareMode } from './types';

/**
 * Compare user output with expected output.
 * - strict: exact byte-level match
 * - loose:  ignore trailing whitespace on each line and trailing blank lines
 */
export function compareOutput(
  userOutput: string,
  expectedOutput: string,
  mode: CompareMode,
): boolean {
  if (mode === 'strict') {
    return userOutput === expectedOutput;
  }

  // loose mode
  const normalize = (s: string): string => {
    return s
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n+$/, '');
  };

  return normalize(userOutput) === normalize(expectedOutput);
}