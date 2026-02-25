---
name: pyjudger-client
description: A client for communicating with the pyjudger service
---

---

## English Version

### Introduction

PyJudger Client is a Node.js/TypeScript client for communicating with the PyJudger backend to judge and validate code. This project is only the client side and needs to be used with the main PyJudger backend.

### Prerequisites

1. **Download PyJudger Backend**:
   - Visit https://github.com/Rduanchen/pyjudger
   - Download and set up the PyJudger backend

2. **System Requirements**:
   - Node.js (version 14 or higher recommended)
   - Python (corresponding version)
   - TypeScript

### Installation

```bash
npm install
```

### Usage

#### Basic Example

```typescript
import { PyJudger, JudgerRequest } from './src/index';
import * as path from 'path';

// Initialize PyJudger with the path to the backend main script
const judgerPath = path.resolve(__dirname, '../pyjudger/main.py');
const judger = new PyJudger(judgerPath);

// Listen to process status (optional)
judger.onStatus((data) => {
  console.log(`Judger PID: ${data.judgerPid}, Target PID: ${data.targetPid}`);
});

// Prepare a judging request
const request: JudgerRequest = {
  tempDir: '/tmp/pyjudger', // Temporary directory
  compilerPath: '', // Compiler path (if needed)
  language: 'PYTHON', // Language: C, CPP, JAVA, PYTHON, NODEJS
  codeString: "print('Hello, World!')", // Code to execute
  compareMode: 'strict', // Comparison mode: strict or loose
  timeLimit: 1000, // Time limit in milliseconds
  memoryLimit: 256 * 1024 * 1024, // Memory limit in bytes (optional)
  subtasks: [[{ input: '', output: 'Hello, World!\n' }]]
};

// Execute judging
async function judge() {
  try {
    const result = await judger.run(request);
    console.log('Judging result:', result);
  } catch (error) {
    console.error('Judging failed:', error);
  }
}

judge();
```

#### API Reference

##### `PyJudger` Class

**Constructor**

```typescript
constructor(pythonScriptPath: string)
```

- Parameter: `pythonScriptPath` - Full path to the PyJudger backend main script

**Methods**

1. **`onStatus(callback: (data: ProcessStatusData) => void)`**
   - Register a callback function to monitor process status
   - Callback parameter includes `judgerPid` and `targetPid`

2. **`async run(request: JudgerRequest): Promise<any>`**
   - Execute a judging task
   - Parameter: Judging request object
   - Returns: Judging result (contains subtask results or error message)

3. **`stop()`**
   - Stop the currently executing judge task

##### `JudgerRequest` Interface

| Property       | Type            | Description                            |
| -------------- | --------------- | -------------------------------------- |
| `tempDir`      | string          | Temporary directory path               |
| `compilerPath` | string          | Compiler path                          |
| `language`     | string          | Language: C, CPP, JAVA, PYTHON, NODEJS |
| `codeString`   | string          | Code to execute                        |
| `compareMode`  | string          | Comparison mode: strict or loose       |
| `timeLimit`    | number          | Time limit in milliseconds             |
| `memoryLimit`  | number          | Memory limit in bytes (optional)       |
| `subtasks`     | SubtaskCase[][] | List of subtasks                       |

### Test Examples

This project provides complete test code in `src/example.ts`, including the following test cases:

1. **Normal Execution** - Simple Hello World program
2. **Wrong Answer (WA)** - Program output doesn't match expected result
3. **Time Limit Exceeded (TLE)** - Program execution exceeds time limit
4. **Memory Limit Exceeded (MLE)** - Program uses too much memory

#### Running Tests

```bash
npm run ex
```

This command will compile TypeScript and execute all test examples.

### Project Structure

```
pyjudger-client/
├── src/
│   ├── index.ts          # Main client code
│   └── example.ts        # Test examples
├── package.json
├── tsconfig.json
├── README.md
└── temp_test_sdk/        # Temporary test directory
```

### FAQ

**Q: How do I use this client?**
A: First download the PyJudger backend from https://github.com/Rduanchen/pyjudger, then use this client to connect to the backend for judging.

**Q: What programming languages are supported?**
A: C, C++, Java, Python, and Node.js are supported.

**Q: How do I set time and memory limits?**
A: Set the `timeLimit` and `memoryLimit` properties in the `JudgerRequest` object.
