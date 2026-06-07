---
name: api spec
description: API specification for electron-vite project
---

## API Specification for ntut-exam backend

### Base URL example

http://localhost:3001/api

### API Endpoints

```
"/auth/check-id": {
    "post": {
        "summary": "Check if student ID exists",
        "tags": [
        "User-Auth"
        ],
        "requestBody": {
        "required": true,
        "content": {
            "application/json": {
            "schema": {
                "type": "object",
                "properties": {
                "studentID": {
                    "type": "string"
                }
                }
            }
            }
        }
        },
        "responses": {
        "200": {
            "description": "Student ID exists"
        }
        }
    }
    },
    "/auth/register": {
    "post": {
        "summary": "Register user crypto info (one-time registration)",
        "tags": [
        "User-Auth"
        ],
        "requestBody": {
        "required": true,
        "content": {
            "application/json": {
            "schema": {
                "type": "object",
                "properties": {
                "encryptedPayload": {
                    "type": "string"
                }
                }
            }
            }
        }
        },
        "responses": {
        "201": {
            "description": "User registered successfully"
        }
        }
    }
    },
    "/auth/public-key": {
    "get": {
        "summary": "Get system RSA public key",
        "tags": [
        "User-Auth"
        ],
        "responses": {
        "200": {
            "description": "System RSA Public Key"
        }
        }
    }
    },
    "/auth/verify-token": {
    "post": {
        "summary": "Verify user token",
        "tags": [
        "User-Auth"
        ],
        "security": [
        {
            "bearerAuth": []
        }
        ],
        "responses": {
        "200": {
            "description": "Token is valid"
        }
        }
    }
    },
    "/exam/config": {
    "get": {
        "summary": "Get exam config (before exam starts)",
        "tags": [
        "User-Exam"
        ],
        "responses": {
        "200": {
            "description": "Public exam config"
        }
        }
    }
    },
    "/exam/config-secure": {
    "post": {
        "summary": "Get exam config with token (after exam starts)",
        "tags": [
        "User-Exam"
        ],
        "security": [
        {
            "bearerAuth": []
        }
        ],
        "responses": {
        "200": {
            "description": "Encrypted exam config"
        }
        }
    }
    },
    "/exam/result": {
    "post": {
        "summary": "Upload local test results",
        "tags": [
        "User-Exam"
        ],
        "security": [
        {
            "bearerAuth": []
        }
        ],
        "requestBody": {
        "content": {
            "application/json": {
            "schema": {
                "type": "object",
                "properties": {
                "result": {
                    "type": "object"
                }
                }
            }
            }
        }
        },
        "responses": {
        "200": {
            "description": "Result uploaded"
        }
        }
    }
    },
    "/exam/upload": {
    "post": {
        "summary": "Upload program file",
        "tags": [
        "User-Exam"
        ],
        "security": [
        {
            "bearerAuth": []
        }
        ],
        "requestBody": {
        "content": {
            "multipart/form-data": {
            "schema": {
                "type": "object",
                "properties": {
                "studentID": {
                    "type": "string"
                },
                "file": {
                    "type": "string",
                    "format": "binary"
                }
                }
            }
            }
        }
        },
        "responses": {
        "200": {
            "description": "File uploaded successfully"
        }
        }
    }
    },
    "/log/action": {
    "post": {
        "summary": "Log user action",
        "tags": [
        "User-Log"
        ],
        "requestBody": {
        "content": {
            "application/json": {
            "schema": {
                "type": "object",
                "properties": {
                "action": {
                    "type": "string"
                },
                "studentID": {
                    "type": "string"
                }
                }
            }
            }
        }
        },
        "responses": {
        "200": {
            "description": "Action logged"
        }
        }
    }
    },
    "/message/all": {
    "get": {
        "summary": "Get messages after a specific ID",
        "tags": [
        "User-Message"
        ],
        "parameters": [
        {
            "in": "query",
            "name": "afterId",
            "schema": {
            "type": "string"
            }
        }
        ],
        "responses": {
        "200": {
            "description": "List of messages"
        }
        }
    }
    },
    "/message/config-version": {
    "get": {
        "summary": "Get config version",
        "tags": [
        "User-Message"
        ],
        "responses": {
        "200": {
            "description": "Config version"
        }
        }
    }
    },
    "/message/message-version": {
    "get": {
        "summary": "Get message version",
        "tags": [
        "User-Message"
        ],
        "responses": {
        "200": {
            "description": "Message version"
        }
        }
    }
    }
},
```
