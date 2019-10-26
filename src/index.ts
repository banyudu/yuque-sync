import * as SDK from '@yuque/sdk'
import * as YAML from 'yaml'
import * as path from 'path'
import * as fs from 'fs'
import * as sanitize from 'sanitize-filename'
import { promisify } from 'util'
import * as PromisePool from 'es6-promise-pool'

const writeAsync = promisify(fs.writeFile).bind(fs)
const copyAsync = promisify(fs.copyFile).bind(fs)

interface SideBar {
    key: string;
    name: string;
    children?: SideBar[];
}

const syncArticle = async (client: any, bookId: number | string, articleId: number, path: string, loader?: (src: string) => Promise<string> | string) => {
    let retryTimes = 0
    while (true) {
        try {
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
            break
        } catch (error) {
            retryTimes++
            if (retryTimes >= 3) {
                throw error
            }
            console.warn(`${articleId} failed, retry ${retryTimes} times...`)
        }
    }
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

function trimBlacklist (toc: any[], blacklist: Array<string | number>): any[] {
    // trim a node if its parent node is in blacklist
    let blacklistLevel = Number.MAX_VALUE
    const blackSet = new Set(blacklist)
    for (let item of toc) {
        if (blackSet.has(item.id) || blackSet.has(item.url)) {
            if (blacklistLevel > item.level) {
                blacklistLevel = item.level
            }
        } else {
            if (blacklistLevel < item.level) {
                // child of blacklist nodes
                blackSet.add(item.id)
            } else {
                blacklistLevel = Number.MAX_VALUE
            }
        }
    }
    return toc.filter(item => !blackSet.has(item.id) && !blackSet.has(item.url))
}

const syncBook = async ({ token, bookId, dir, loader, concurrency = 5, blacklist = [] }: {
    token?: string;
    bookId: number | string;
    dir: string;
    concurrency?: number;
    blacklist?: Array<number | string>;
    loader?: (src: string) => Promise<string> | string
}) => {
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
    if (!tocStr) {
        console.error('only support <Book> Type')
        process.exit(1)
    }
    let toc = YAML.parse(tocStr)
    toc = trimBlacklist(toc, blacklist)
    const sidebar: SideBar = { key: '', name: '', children: [] }
    let level2Node: { [key: number]: SideBar } = { 0: sidebar }
    const rootNode = level2Node[0]

    let baseLevel = 0
    if (toc && toc[2]) {
        baseLevel = toc[2].level
    }
    const existKeys = new Set()

    let index = -1
    const promiseProducer = function () {
        index++
        if (index >= toc.length) {
            return null
        }
        const item = toc[index]
        if (item.type === 'DOC' || item.type === 'TITLE') {
            const baseKey = [sanitize(item.title)].join('-')
            let key = baseKey
            for (let index = 2; existKeys.has(key); index++) {
                key = `${baseKey}${index}`
            }
            existKeys.add(key)

            // create sidebar
            let level = item.level - baseLevel + 1
            const node = { key: item.type === 'DOC' ? key : '', name: item.title }
            level2Node[level] = node

            const pNode = level2Node[level - 1] || rootNode
            pNode.children = pNode.children || []
            pNode.children.push(node)

            // fetch data
            if (item.type === 'DOC') {
                const filename = [key, 'md'].join('.')
                return syncArticle(client, bookId, item.id, path.join(dir, filename), loader)
            }
        }
        return new Promise((resolve, reject) => { resolve() })
    }
    const pool = new PromisePool(promiseProducer, concurrency)
    await pool.start()

    const asyncTasks = []
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
