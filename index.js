const Express = require("express")
const { Client } = require("pg")
const session = require("express-session")
const passport = require("passport")
const bcrypt = require("bcrypt")
const { Strategy } = require("passport-local")
const cookieParser = require("cookie-parser")

const db = new Client({
    user: "postgres",
    host: "localhost",
    database: "BookDB",
    password: "Dharmesh@2002"
})

let resultOffset = 0
const app = Express()
let genres = []
let authors = []
let pageNumber = 0
let maxPageCount = 0

async function getMaxNumberOfBooks() {
    const response = await db.query("SELECT id FROM books")
    maxPageCount = Math.floor(response.rowCount / 10)
}

app.use(Express.urlencoded({ extended: true }))
//This line must come before using passport session
app.use(session({
    secret: "ARCHIVES",
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000
    }
}))
app.use(Express.static("public"))
app.use(cookieParser())
app.use(passport.initialize())
app.use(passport.session())


app.get("/", (req, res) => {
    res.render("login-reg.ejs")
})

app.get("/home", async (req, res) => {
    if (req.isAuthenticated()) {
        console.log(res.user)
        try {
            genres = []
            authors = []
            console.log(req.user, res.user)
            console.log("Page number is", req.query.page)
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
            const responseBooks = await db.query(query)
            query = "SELECT DISTINCT genre FROM books"
            const responseGenres = await db.query(query)
            responseGenres.rows.forEach((genre) => genres.push(genre.genre))
            query = "SELECT name AS author FROM authors"
            const responseAuthors = await db.query(query)
            responseAuthors.rows.forEach((author) => authors.push(author.author))
            res.cookie("uid", req.user.id)
            res.cookie("username", req.user.username)
            res.render("index.ejs", { books: responseBooks.rows, genres: genres, authors: authors, pageNumber: pageNumber, user_id: req.user.id })
        } catch (error) {
            console.log(error)
        }
    } else res.redirect("/")
})

app.get("/pagination/:direction", (req, res) => {
    if (req.params.direction === "next") {
        console.log(pageNumber <= maxPageCount)
        return res.redirect(`/?page=${pageNumber < maxPageCount ? ++pageNumber : pageNumber}`)
    }
    else {
        res.redirect(`/?page=${pageNumber > 0 ? --pageNumber : 0}`)
    }
})

app.get("/filter", async (req, res) => {
    try {
        resultOffset = Number(req.query.page ?? 0) * 10
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
        console.log(query)
        const response = await db.query(query)
        res.render("index.ejs", { books: response.rows, genres: genres, authors: authors })
    } catch (error) {
        console.log(error)
    }
})

app.get("/bookmarks", async (req, res) => {
    if (req.isAuthenticated()) {
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
	JOIN bookmarks bkm ON b.id = bkm.book_id AND bkm.uid = ${req.user.id};`
        const response = await db.query(query)
        console.log(response.rowCount)
        return res.render("bookmarks.ejs", { books: response.rows, count: response.rowCount })
    } else {
        res.redirect("/")
    }
})

app.post("/add-to-bookmarks", async (req, res) => {
    try {
        if (req.isAuthenticated()) {
            const query = `INSERT INTO bookmarks (book_id, uid) VALUES($1, $2)`
            const response = await db.query(query, [req.body.book_id, req.body.uid])
            res.redirect("/home")
        } else {
            res.redirect("/")
        }
    } catch (error) {
        console.log(error)
    }
})


app.post("/login", passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/"
}))

app.post("/register", async (req, res) => {
    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [req.body.email])
        if (checkResult.rowCount > 0) {
            return res.redirect("/")
        }
        const salt = await bcrypt.genSalt(5)
        const hasedPassword = await bcrypt.hash(req.body.password, salt)
        const result = await db.query("INSERT INTO users (email, username, password) VALUES ($1, $2, $3) RETURNING *", [req.body.email, req.body.username, hasedPassword])
        const user = result.rows[0]
        req.login(user, (err) => {
            if (err) throw err
            res.redirect("/home")
        })
    } catch (error) {
        console.log(error)
    }
})

passport.use(new Strategy(async function verify(username, password, cb) {
    try {
        const result = await db.query("SELECT * FROM users WHERE username = $1", [username])
        console.log(username, password)
        if (result.rowCount > 0) {
            const user = result.rows[0]
            const storedHasedPassword = user.password
            bcrypt.compare(password, storedHasedPassword, (err, result) => {
                if (err) {
                    return cb(err)
                } else {
                    if (result) {
                        return cb(null, user)
                    } else {
                        return cb(null, user)
                    }
                }
            })
        } else {
            return cb("User not found!")
        }
    } catch (error) {
        return cb(error)
    }
}))

passport.serializeUser((user, cb) => {
    cb(null, user)
})

passport.deserializeUser((user, cb) => {
    cb(null, user)
})

app.listen(2000, () => {
    try {
        db.connect(() => {
            console.log("PSQL connected")
        })
        getMaxNumberOfBooks()
        console.log("Server running...")
    } catch (error) {
        console.log(error.stack)
    }
})
