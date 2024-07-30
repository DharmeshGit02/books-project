const Express = require("express")
const { Client } = require("pg")
const session = require("express-session")
const passport = require("passport")
const bcrypt = require("bcrypt")
const { Strategy } = require("passport-local")
const cookieParser = require("cookie-parser")
require("dot-env").config()

const db = new Client({
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DB,
    password: process.env.PSQL_PASSWORD
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
    secret: process.env.SESSION_SECRET,
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
    // console.log("Cookies:", req.cookies, req.cookies.username)
    if (req.isAuthenticated()) {
        // console.log(res.user)
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
            res.render("index.ejs", { books: responseBooks.rows, genres: genres, authors: authors, pageNumber: pageNumber, user_id: req.cookies.uid, username: req.cookies.username })
        } catch (error) {
            console.log(error)
        }
    } else res.redirect("/")
})

app.get("/pagination/:direction", (req, res) => {
    if (req.params.direction === "next") {
        // console.log(pageNumber <= maxPageCount)
        return res.redirect(`/home?page=${pageNumber < maxPageCount ? ++pageNumber : pageNumber}`)
    }
    else {
        res.redirect(`/home?page=${pageNumber > 0 ? --pageNumber : 0}`)
    }
})

app.get("/home/filter", async (req, res) => {
    try {
        console.log(authors)
        resultOffset = Number(req.query.page ?? 0) * 10
        const genre = req.query.genre ?? false
        const author = req.query.author ?? false
        const query = `
            SELECT 
            a.name AS author,
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
        res.render("index.ejs", { books: response.rows, genres: genres, authors: authors, username: req.cookies.username, user_id: req.cookies.id })
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
        // console.log(response.rowCount)
        return res.render("bookmarks.ejs", { books: response.rows, count: response.rowCount, username: req.cookies.username})
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

passport.use(new Strategy(async function verify(username, password, cb) {
    try {
        const result = await db.query("SELECT * FROM users WHERE username = $1", [username])
        // console.log(username, password)
        if (result.rowCount > 0) {
            const user = result.rows[0]
            const storedHasedPassword = user.password
            const isMatch = await bcrypt.compare(password, storedHasedPassword)
            if (isMatch) {
                return cb(null, user)
            } else {
                return cb(null, false, { "message": "Password Incorrect!" })
            }
        } else {
            return cb(null, false, "User not found!")
        }
    } catch (error) {
        return cb(error)
    }
}))

passport.serializeUser((user, cb) => {
    cb(null, user.id)
})

passport.deserializeUser(async (id, cb) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE id = $1", [id])
        if (result.rowCount !== 0) {
            return cb(null, result.rows[0])
        } else {
            return cb(null, false, { "message": "No user found!" })
        }
    } catch (error) {
        cb(error)
    }
})

app.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if(err) {
            return next(err)
        } else if(!user) {
            return res.redirect("/")
        } else {
            req.login(user, (err) => {
                if(err) {
                    return next(err)
                } else {
                    res.cookie("uid", req.user.id)
                    res.cookie("username", req.user.username)
                    return res.redirect("/home")
                }
            })
        }
    })(req, res, next)
})

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    })
})

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
            res.cookie("uid", req.user.id)
            res.cookie("username", req.user.username)
            res.redirect("/home")
        })
    } catch (error) {
        console.log(error)
    }
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
