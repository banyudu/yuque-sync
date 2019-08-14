import * as SDK from '@yuque/sdk'
import * as YAML from 'yaml'
import * as path from 'path'
import * as fs from 'fs'
import * as sanitize from 'sanitize-filename'
import { promisify } from 'util'

const writeAsync = promisify(fs.writeFile).bind(fs)

interface SideBar {
    key: string;
    name: string;
    children?: SideBar[];
}

const client = new SDK({
    token: process.env.YUQUE_TOKEN || undefined
});


const syncArticle = async (bookId: number, articleId: number, path: string, loader?: (src: string) => Promise<string> | string) => {
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


const syncBook = async (bookId: number, dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    const repo = await client.repos.get({
        namespace: bookId // bookId
    })
    const tocStr = repo.toc_yml
    const toc = YAML.parse(tocStr)
    const sidebar: SideBar = { key: '', name: '', children: [] }
    let level2Node: { [key: number]: SideBar } = { 0: sidebar }

    const articleTasks = []
    for (let item of toc) {
        if (item.type === 'DOC') {
            // fetch data
            const key = [item.url, sanitize(item.title)].join('-')
            const filename = [key, 'md'].join('.')
            articleTasks.push(syncArticle(bookId, item.id, path.join(dir, filename)))

            // create sidebar
            let level = item.level + 1
            const node = { key, name: item.title }
            level2Node[level] = node

            const pNode = level2Node[level - 1]
            pNode.children = pNode.children || []
            pNode.children.push(node)
        }
    }
    const sidebarPath = path.join(dir, 'sidebar.json')
    await writeAsync(sidebarPath, JSON.stringify(sidebar.children))

    await Promise.all(articleTasks)
}

export default syncBook