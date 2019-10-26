import sync from '../src/'

const bookId = 526931

sync({
    bookId,
    dir: './out',
    blacklist: [2981651]
})