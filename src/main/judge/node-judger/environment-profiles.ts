import type { SupportedLanguage } from '../../../common/types';
import type { Language } from './types';

export interface EnvironmentToolProbe {
  name: string;
  command: string;
  args: string[];
}

export interface EnvironmentDiagnosticProfile {
  source: string;
  timeLimitMs: number;
  memoryLimitBytes: number;
}

export interface EnvironmentLanguageProfile {
  language: SupportedLanguage;
  judgeLanguage: Language;
  tools: EnvironmentToolProbe[];
  smoke: EnvironmentDiagnosticProfile;
  tle: EnvironmentDiagnosticProfile;
  mle: EnvironmentDiagnosticProfile;
}

const MiB = 1024 * 1024;
const smokeLimits = (source: string): EnvironmentDiagnosticProfile => ({
  source,
  timeLimitMs: 5_000,
  memoryLimitBytes: 512 * MiB
});
const tleLimits = (source: string): EnvironmentDiagnosticProfile => ({
  source,
  timeLimitMs: 350,
  memoryLimitBytes: 512 * MiB
});
const mleLimits = (source: string, memoryLimitBytes: number): EnvironmentDiagnosticProfile => ({
  source,
  timeLimitMs: 6_000,
  memoryLimitBytes
});
const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

export const ENVIRONMENT_LANGUAGE_ORDER: SupportedLanguage[] = [
  'C',
  'Cpp',
  'Python',
  'JavaScript',
  'Java'
];

export const ENVIRONMENT_LANGUAGE_PROFILES: Record<SupportedLanguage, EnvironmentLanguageProfile> =
  {
    C: {
      language: 'C',
      judgeLanguage: 'C',
      tools: [{ name: 'gcc', command: 'gcc', args: ['--version'] }],
      smoke: smokeLimits('#include <stdio.h>\nint main(void){puts("ENV_CHECK_OK");return 0;}'),
      tle: tleLimits('int main(void){volatile unsigned long n=0;for(;;){n++;}}'),
      mle: mleLimits(
        '#include <stdlib.h>\n#include <string.h>\nint main(void){static void *volatile keep[4096];size_t i=0;for(;;){void *p=malloc(4*1024*1024);if(!p)return 2;memset(p,1,4*1024*1024);keep[i++%4096]=p;}}',
        48 * MiB
      )
    },
    Cpp: {
      language: 'Cpp',
      judgeLanguage: 'CPP',
      tools: [{ name: 'g++', command: 'g++', args: ['--version'] }],
      smoke: smokeLimits('#include <iostream>\nint main(){std::cout<<"ENV_CHECK_OK\\n";}'),
      tle: tleLimits('int main(){volatile unsigned long n=0;for(;;){n++;}}'),
      mle: mleLimits(
        '#include <vector>\n#include <memory>\nint main(){std::vector<std::unique_ptr<char[]> > v;for(;;){auto p=std::make_unique<char[]>(4*1024*1024);p[0]=1;v.push_back(std::move(p));}}',
        48 * MiB
      )
    },
    Python: {
      language: 'Python',
      judgeLanguage: 'PYTHON',
      tools: [{ name: pythonCommand, command: pythonCommand, args: ['--version'] }],
      smoke: smokeLimits('print("ENV_CHECK_OK")'),
      tle: tleLimits('while True:\n    pass'),
      mle: mleLimits(
        'items = []\nwhile True:\n    block = bytearray(4 * 1024 * 1024)\n    block[0] = 1\n    items.append(block)',
        64 * MiB
      )
    },
    JavaScript: {
      language: 'JavaScript',
      judgeLanguage: 'NODEJS',
      tools: [{ name: 'node', command: 'node', args: ['--version'] }],
      smoke: smokeLimits('console.log("ENV_CHECK_OK")'),
      tle: tleLimits('while (true) {}'),
      mle: mleLimits(
        'const items=[]; while(true){const b=Buffer.alloc(4*1024*1024,1);items.push(b);}',
        96 * MiB
      )
    },
    Java: {
      language: 'Java',
      judgeLanguage: 'JAVA',
      tools: [
        { name: 'javac', command: 'javac', args: ['-version'] },
        { name: 'java', command: 'java', args: ['-version'] }
      ],
      smoke: smokeLimits(
        'public class Main { public static void main(String[] args) { System.out.println("ENV_CHECK_OK"); } }'
      ),
      tle: tleLimits(
        'public class Main { public static void main(String[] args) { while (true) {} } }'
      ),
      mle: mleLimits(
        'import java.util.*; public class Main { public static void main(String[] args) { List<byte[]> a=new ArrayList<>(); while(true){byte[] b=new byte[4*1024*1024]; Arrays.fill(b,(byte)1); a.add(b);} } }',
        160 * MiB
      )
    }
  };

export function getEnvironmentLanguageProfile(
  language: SupportedLanguage
): EnvironmentLanguageProfile {
  return ENVIRONMENT_LANGUAGE_PROFILES[language];
}
