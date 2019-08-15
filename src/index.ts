import * as SDK from '@yuque/sdk'
import * as YAML from 'yaml'
import * as path from 'path'
import * as fs from 'fs'
import * as sanitize from 'sanitize-filename'
import { promisify } from 'util'

const writeAsync = promisify(fs.writeFile).bind(fs)
const copyAsync = promisify(fs.copyFile).bind(fs)

interface SideBar {
    key: string;
    name: string;
    children?: SideBar[];
}

const syncArticle = async (client: any, bookId: number, articleId: number, path: string, loader?: (src: string) => Promise<string> | string) => {
    const article = await client.docs.get({
        namespace: bookId,
        slug: articleId,
        data: {
            raw: 1
        }
    })

    const markdown = loader? await loader(article.body) : article.body
    await writeAsync(path, markdown)
    console.log('Write ', path)
}

const getDocsifySideBar = (sideBar?: SideBar[], level = 0): string => {
    if (!sideBar || !sideBar.length) return ''
    const result = []
    const prefix = ' '.repeat(2 * level)
    for (let item of sideBar) {
        const content = item.key ? `[${item.name}](<${encodeURIComponent(item.key)}.md>)` : item.name
        result.push(`${prefix}* ${content}`)
        if (item.children && item.children.length) {
            result.push(getDocsifySideBar(item.children, level + 1))
        }
    }
    return result.join('\n')
}


const syncBook = async ({ token, bookId, dir, loader }: { token?: string, bookId: number, dir: string, loader?: (src: string) => Promise<string> | string }) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    const client = new SDK({
        token: token || process.env.YUQUE_TOKEN || undefined
    })
    const repo = await client.repos.get({
        namespace: bookId // bookId
    })
    const tocStr = repo.toc_yml
    const toc = YAML.parse(tocStr)
    const sidebar: SideBar = { key: '', name: '', children: [] }
    let level2Node: { [key: number]: SideBar } = { 0: sidebar }
    const rootNode = level2Node[0]

    const asyncTasks = []
    let baseLevel = 0
    if (toc && toc[2]) {
        baseLevel = toc[2].level
    }
    const existKeys = new Set()
    for (let item of toc) {
        if (item.type === 'DOC' || item.type === 'TITLE') {
            // fetch data
            const baseKey = [sanitize(item.title)].join('-')
            let key = baseKey
            for (let index = 2; existKeys.has(key); index++) {
                key = `${baseKey}${index}`
            }
            existKeys.add(key)
            if (item.type === 'DOC') {
                const filename = [key, 'md'].join('.')
                asyncTasks.push(syncArticle(client, bookId, item.id, path.join(dir, filename), loader))
            }

            // create sidebar
            let level = item.level - baseLevel + 1
            const node = { key: item.type === 'DOC' ? key : '', name: item.title }
            level2Node[level] = node

            const pNode = level2Node[level - 1] || rootNode
            pNode.children = pNode.children || []
            pNode.children.push(node)
        }
    }
    const sidebarPath = path.join(dir, 'sidebar.json')
    asyncTasks.push(writeAsync(sidebarPath, JSON.stringify(sidebar.children)))

    const docsifySideBarPath = path.join(dir, '_sidebar.md')
    asyncTasks.push(writeAsync(docsifySideBarPath, getDocsifySideBar(sidebar.children)))

    // copy files
    for (let file of ['index.html']) {
        asyncTasks.push(copyAsync(path.join(__dirname, file), path.join(dir, file)))
    }

    await Promise.all(asyncTasks)
}

export default syncBook
