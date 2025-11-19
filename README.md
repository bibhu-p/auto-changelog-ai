## 📘 AI-Powered Changelog Generator

Automatically generate detailed changelog entries using AI—triggered by commit prefixes.

### 🚀 Overview

AI-Powered Changelog Generator is a Node.js-based automation tool that creates clean, descriptive changelog entries whenever specific commit prefixes are used.

It reads your latest commit message and diff, sends them to an AI model, generates high-quality titles, summaries, and technical explanations, and updates CHANGELOG.md automatically.

#### Supports:

- **✔** Automatic generation on commit (local Git hooks)

- **✔** Automatic generation on push (GitHub Actions)

- **✔** AI-generated changelog titles + descriptions + explanations

- **✔** Customizable commit prefixes

- **✔** Robust modular Node.js architecture

### 🔧 Features

#### ⚡ Automated Triggering

Runs automatically when commit messages contain supported prefixes:

```
changelog:
feat:
fix:
refactor:
docs:
```

### 🧠 AI-Generated Content

For each matching commit, the AI generates:

 - Title
 - Summary
 - Technical Explanation

These are formatted and appended to your CHANGELOG.md.

#### 🛠 Full Git + CI Integration

 - Local hook: runs instantly on each commit

 - GitHub Actions: auto-updates changelog on push

 - No manual steps needed


## 🧩 How It Works

 - You commit with a prefix:
 
 ```
changelog: improved checkout flow
```

- The Git hook or CI job is triggered.

- The system extracts:

    - Commit message

    - Commit hash

    - Commit diff

- These are passed to the AI model.

- AI generates a structured changelog entry.

- The entry is added to CHANGELOG.md.