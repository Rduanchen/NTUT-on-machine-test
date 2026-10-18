# NTUT On machine Test

## Features:

1. This application can function in both online and offline environments.
2. This application can judge the code locally without sending it to the server.
3. This application can protect the test cases properly.

## Demo:

## Development Setup

1. You need to install [Node.js](https://nodejs.org/en/) with npm.
2. Clone this repository to your local machine.
3. Run `npm install` to install the dependencies.
4. Run `npm run dev` to start the development server.

## Windows Build

Run `npm run build:win` on Windows to create the installer in `dist/`.
Python is not bundled with the application and is not required to package the application.

## Local Judging Requirements

To judge Python submissions, install Python on each exam computer and ensure
`python` (Windows) or `python3` (macOS/Linux) is available on PATH.
Other languages also require their corresponding compilers or runtimes on PATH.
