# yuque-sync
Sync articles and toc from Yuque

## Usage

```typescript
import syncBook from 'yuque-sync'

// need process.env.YUQUE_TOKEN

const bookId = '<your book id or namespace>'

const outputDir = '<your target directory>'

async function foo {
    await syncBook (bookId, outputDir)

    // will write markdown files and sidebar.json to given outputDir
}

```
