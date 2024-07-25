const Express = require("express")
const { Pool } = require("pg")
const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "BookDB",
    password: "Dharmesh@2002"
})

let resultOffset = 0
const app = Express()
let genres = []
let authors = []

app.use(Express.urlencoded({ extended: true }))
app.listen(2000, () => {
    console.log("Server running...")
})
pool.on("connect", () => {
    console.log("PSQL Connected!")
})

app.use(Express.static("public"))

app.get("/", async (req, res) => {
    try {
        genres = []
        authors = []
        resultOffset = Number(req.query.page ?? 0) * 10
        let query = `
            SELECT 
                a.name AS author, 
                b.id,
                b.thumbnail,
                b.genre,
                CASE 
                    WHEN b.popularity >= 85 THEN 3
                    WHEN b.popularity >= 65 THEN 2
                ELSE 1
                END AS popularity,
                b.book_title 
                FROM authors a JOIN books b 
                ON a.id = b.author_id LIMIT 10 OFFSET ${resultOffset}
        `
        const responseBooks = await pool.query(query)
        query = "SELECT DISTINCT genre FROM books"
        const responseGenres = await pool.query(query)
        responseGenres.rows.forEach((genre) => genres.push(genre.genre))
        query = "SELECT name AS author FROM authors"
        const responseAuthors = await pool.query(query)
        responseAuthors.rows.forEach((author) => authors.push(author.author))
        // console.log(genres, authors)
        res.render("index.ejs", { books: responseBooks.rows, genres: genres, authors: authors })
    } catch (error) {
        console.log(error)
    }
})

app.get("/filter", async (req, res) => {
    try {
        resultOffset = Number(req.query.page ?? 0) * 10
        // console.log(req.query.genre ?? "Not Present")
        const genre = req.query.genre ?? false
        const author = req.query.author ?? false
        const query = `
            SELECT 
            b.id, 
            b.book_title, 
            b.thumbnail, 
            CASE 
                WHEN b.popularity >= 85 THEN 3
                WHEN b.popularity >= 65 THEN 2
            ELSE 1
            END AS popularity, 
            b.genre, a.name 
            FROM authors a JOIN books b 
            ON a.id = b.author_id ${genre && !author ?
                " AND b.genre LIKE '" + req.query.genre + "' LIMIT 10 OFFSET " + resultOffset :
                !genre && author ? " AND a.name LIKE '" + req.query.author.replace("-", " ") + "' LIMIT 10 OFFSET " + resultOffset :
                    genre && author ?
                        " AND a.name LIKE '" + req.query.author.replace("-", " ") + "' AND b.genre LIKE '" + req.query.genre + "' LIMIT 10 OFFSET " + resultOffset :
                        " LIMIT 10 OFFSET " + resultOffset
            }`
        // console.log(query)
        const response = await pool.query(query)
        res.render("index.ejs", { books: response.rows, genres: genres, authors: authors })
    } catch (error) {
        console.log(error)
    }
})

app.get("/bookmarks", async (req, res) => {
    const query = `
    SELECT
	a.name AS author,
    b.thumbnail,
	b.genre,
	CASE
		WHEN b.popularity >= 85 THEN 3
		WHEN b.popularity >= 65 THEN 2
	ELSE 1
	END AS popularity,
	b.book_title
	FROM authors a JOIN books b ON a.id = b.author_id
	JOIN bookmarks bkm ON b.id = bkm.bid;`
    const response = await pool.query(query)
    console.log(response.rowCount)
    res.render("bookmarks.ejs", { books: response.rows, count: response.rowCount })
})

app.post("/add-to-bookmarks", async (req, res) => {
    try {
        const query = `INSERT INTO bookmarks VALUES(${req.body.book_id})`
        const response = await pool.query(query)
        // console.log(response)
        res.redirect("/")
    } catch (error) {
        console.log(error)
    }
})