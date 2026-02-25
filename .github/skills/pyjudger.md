---
name: pyjudger
description: A judger for judging student's code using the pyjudger backend
---

# Python Judger (pyjudger)

A robust, process-isolated online judge system backend written in Python 3. It supports multiple languages, real-time status updates, timeout handling, and memory limit enforcement.

## Features

- **Multi-Language Support**: C, C++, Java, Python, NodeJS.
- **Process Isolation**: Executes user code in a dedicated temporary directory.
- **Resource Limits**:
  - **Time Limit**: Kills processes that exceed the specified execution time (ms).
  - **Memory Limit**: Kills processes that exceed the specified RSS memory usage (Bytes).
- **Security**:
  - Recursive process tree killing using `psutil`.
  - UTF-8 enforced input/output.
- **Protocol**: JSON-based communication via stdin/stdout.

## Official Extension

[pyjudger-client](https://github.com/Rduanchen/pyjudger-client), PyJudger Client is a Node.js/TypeScript client for communicating with the PyJudger to judge and validate code. This project is only the client side and needs to be used with the PyJudger.

## Installation

### Requirements

- Python 3.8+
- `psutil`
- GCC/G++ (for C/C++)
- JDK (for Java)
- Node.js (for JavaScript)

### Setup

1. Install dependencies:
   ```bash
   pip install -r requirement.txt
   ```

## Usage

Run the judger by executing the `main.py` script. It reads a single JSON request from `stdin` and outputs a JSON result to `stdout`.

### Command Line

```bash
python main.py
```

### Protocol

#### Request (Stdin)

```json
{
  "tempDir": "C:/absolute/path/to/temp/dir",
  "compilerPath": "",
  "language": "PYTHON",
  "codeString": "print(input())",
  "compareMode": "strict",
  "timeLimit": 1000,
  "memoryLimit": 52428800,
  "subtasks": [[{ "input": "hello", "output": "hello\n" }]]
}
```

- **language**: `PYTHON`, `C`, `CPP`, `JAVA`, `NODEJS`.
- **compareMode**: `strict` (exact match) or `loose` (ignore trailing whitespace/lines).
- **timeLimit**: Integer in milliseconds.
- **memoryLimit**: Optional integer in Bytes (e.g., `52428800` for 50MB).

#### Response (Stdout)

The judger prints status updates and the final result.

**1. Status Update:**

```json
{ "type": "STATUS", "data": { "judgerPid": 1234, "targetPid": 5678 } }
```

**2. Final Result:**

```json
{
  "subtasks": [
    [
      {
        "statusCode": "AC",
        "input": "hello",
        "expectingOutput": "hello\n",
        "userOutput": "hello\n",
        "time": "50ms"
      }
    ]
  ]
}
```

**Status Codes:**

- `AC`: Accepted
- `WA`: Wrong Answer
- `TLE`: Time Limit Exceeded
- `MLE`: Memory Limit Exceeded
- `RE`: Runtime Error
- `CE`: Compile Error
- `SE`: System Error
- `ABORTED`: Execution aborted by stop command

### Stop Command

To terminate the running execution, send the following JSON to `stdin`:
