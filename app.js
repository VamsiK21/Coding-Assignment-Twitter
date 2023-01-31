const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const validPassword = (length) => {
  return length >= 6;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Register API
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;

  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const passwordLength = password.length;
    if (validPassword(passwordLength)) {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
          
        )`;
      await db.run(createUserQuery);
      response.send(`User created successfully`);
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API for login user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';
  `;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    //User doesn't exist
    response.status(400);
    response.send("Invalid user");
  } else {
    //Compare password with db password
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API for Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getLatestTweetsQuery = `
    SELECT DISTINCT 
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime
    FROM 
        (follower INNER JOIN tweet ON
        follower.following_user_id = tweet.user_id) AS T
        INNER JOIN user ON 
        T.user_id = user.user_id
    ORDER BY
        CAST(strftime("%m", tweet.date_time) AS INTEGER) DESC,
        CAST(strftime("%d", tweet.date_time) AS INTEGER) DESC,
        CAST(strftime("%Y", tweet.date_time) AS INTEGER) DESC,
        CAST(strftime("%H", tweet.date_time) AS INTEGER) DESC,
        CAST(strftime("%M", tweet.date_time) AS INTEGER) DESC,
        CAST(strftime("%S", tweet.date_time) AS INTEGER) DESC
         
    LIMIT 4;
    `;
  const latestTweets = await db.all(getLatestTweetsQuery);
  response.send(latestTweets);
});

//API for Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getLoggedUser = `
  SELECT
    *
  FROM
    user
  WHERE
    user.username = '${username}'
  `;
  const dbUser = await db.get(getLoggedUser);

  const getListOfNames = `
    SELECT 
        user.username
    FROM
        follower INNER JOIN user ON
        follower.following_user_id = user.user_id
    WHERE
        follower.follower_user_id = ${dbUser.user_id};
  `;
  const user = await db.all(getListOfNames);
  response.send(user);
});

//API for Returns the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getLoggedUser = `
  SELECT
    *
  FROM
    user
  WHERE
    user.username = '${username}'
  `;
  const dbUser = await db.get(getLoggedUser);

  const getListOfNames = `
    SELECT 
        user.username
    FROM
        follower INNER JOIN user ON
        follower.follower_user_id = user.user_id
    WHERE
        follower.following_user_id = ${dbUser.user_id};
  `;
  const user = await db.all(getListOfNames);
  response.send(user);
});

//API for specific tweet
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;

  const getLoggedUser = `
  SELECT
    *
  FROM
    user
  WHERE
    user.username = '${username}'
  `;
  const dbUser = await db.get(getLoggedUser);

  const getTweetQuery = `
  SELECT 
    tweet.tweet AS tweet,
    tweet.date_time AS dateTime
  FROM
    follower INNER JOIN tweet ON
        follower.following_user_id = tweet.user_id
    WHERE
        follower.follower_user_id = ${dbUser.user_id}
        AND tweet.tweet_id = ${tweetId};
    
  `;
  const tweetWithStats = await db.all(getTweetQuery);

  response.send(tweetWithStats);
});
