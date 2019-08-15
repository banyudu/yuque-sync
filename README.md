# yuque-sync
Sync articles and toc from Yuque

## Usage

```typescript
import syncBook from 'yuque-sync'

const bookId = '<your book id or namespace>'

const outputDir = '<your target directory>'

async function foo {
    await syncBook ({
        token: process.env.YUQUE_TOKEN,
        bookId,
        dir: outputDir
    })

    // will write markdown files and sidebar.json and _sidebar(docsify) to given dir
}

```

You can provide a custom loader, to parse markdown file contents, for example replace image links.

```typescript
import syncBook from 'yuque-sync'

const bookId = '<your book id or namespace>'

const outputDir = '<your target directory>'

const myLoader = markdown => {
    // do something
    return markdown
}

async function foo {
    await syncBook ({
        token: process.env.YUQUE_TOKEN,
        bookId,
        dir: outputDir,
        loader: myLoader
    })

    // will write markdown files and sidebar.json and _sidebar(docsify) to given dir
}

```
