// 單一 Test Case
export interface TestCase {
    id: string;
    input: string;
    output: string;
}

// Test Case Group
export interface TestCaseGroup {
    title: string;
    id: number;
    openTestCases: TestCase[];
    hiddenTestCases: TestCase[];
}

// Puzzle
export interface Puzzle {
    id: string;
    name: string;
    language: string;
    testCases: TestCaseGroup[];
}

// Test time settings
export interface TestTime {
    startTime: string; // ISO timestamp
    endTime: string; // ISO timestamp
    forceQuit: boolean;
}

export interface AccessableUser {
    id: string;
    name: string;
}

// 整體 config 物件
export interface Config {
    testTitle: string;
    description: string;
    publicKey: string;
    remoteHost: string;
    accessableUsers: AccessableUser[];
    testTime: TestTime;
    puzzles: Puzzle[];
}

export interface StudentInformation {
    name: string;
    id: string;
}