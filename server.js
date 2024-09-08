const http = require("http");
const path = require("path");
const Koa = require("koa");
const koaBody = require("koa-body").default;
const generateApiKey = require("generate-api-key").default;
const koaStatic = require("koa-static");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const random = require("@sefinek/random-animals");
const cors = require("@koa/cors");
const ffmpeg = require("ffmpeg");

const app = new Koa();

app.use(cors());

let users = [];
const commands = ["@chaos помощь", "@chaos картинка", "@chaos рецепт"];

const public = path.join(__dirname, "/public");
app.use(koaStatic(public, {
  setHeaders(res) {
    res.setHeader("accept-ranges", "bytes")
  },
}));

app.use(async (ctx, next) => {
  const origin = ctx.request.get("Origin");
  if (!origin) {
    return await next();
  }

  const headers = { "Access-Control-Allow-Origin": "*" };

  if (ctx.request.method !== "OPTIONS") {
    ctx.response.set({ ...headers });
    try {
      return await next();
    } catch (e) {
      e.headers = { ...e.headers, ...headers };
      throw e;
    }
  }

  if (ctx.request.get("Access-Control-Request-Method")) {
    ctx.response.set({
      ...headers,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH",
    });

    if (ctx.request.get("Access-Control-Request-Headers")) {
      ctx.response.set("Access-Control-Allow-Headers", ctx.request.get("Access-Control-Request-Headers"))
    }

    ctx.response.status = 204;
  }
});

app.use(koaBody({
  text: true,
  urlencoded: true,
  multipart: true,
  formidable: {
    uploadDir: path.join(__dirname, "public"),
    keepExtensions: true,
  },
  json: true,
}));

const Router = require("koa-router");
const router = new Router();

router.post("/messages", async (ctx, next) => {
  const { apiKey, offset, type } = ctx.request.body;

  const decodedApiKey = decodeURIComponent(apiKey);

  let userFound = false;
  let filteredMessages;

  for (const user of users) {
    if (user.apiKey === decodedApiKey) {
      userFound = true;

      if (!type) {
        if (offset >= user.messages.length) {
          ctx.response.body = JSON.stringify({ messages: [] });
        } else {
          const messages = user.messages.slice(Math.max(0, user.messages.length - offset - 10), user.messages.length - offset);
          ctx.response.body = JSON.stringify({ messages: messages });
        }
        ctx.response.status = 200;
      } else if (type === "favorite") {
        filteredMessages = user.messages.filter(message => message.isFavorite);
        if (offset >= filteredMessages.length) {
          ctx.response.body = JSON.stringify({ messages: [] });
        } else {
          const messages = filteredMessages.slice(Math.max(0, filteredMessages.length - offset - 10), filteredMessages.length - offset);
          ctx.response.body = JSON.stringify({ messages: messages });
        }
        ctx.response.status = 200;
      } else {
        filteredMessages = user.messages.filter(message => message.type === type);
        if (offset >= filteredMessages.length) {
          ctx.response.body = JSON.stringify({ messages: [] });
        } else {
          const messages = filteredMessages.slice(Math.max(0, filteredMessages.length - offset - 10), filteredMessages.length - offset);
          ctx.response.body = JSON.stringify({ messages: messages });
        }
        ctx.response.status = 200;
      }

      break;
    }
  }

  if (!userFound) {
    ctx.response.status = 200;
    ctx.response.body = JSON.stringify({ error: "Пользователь не найден" });
  }
});

router.post("/search", async (ctx, next) => {
  const { apiKey, offset, type, search } = ctx.request.body;

  let filteredMessages;

  for (const user of users) {
    if (user.apiKey === apiKey) {
      if (!type) {
        if (search !== "") {
          filteredMessages = user.messages.filter(message => {
            if (message.type === "file" || message.type === "video" || message.type === "audio" || message.type === "image") {
              return message && message.file.includes(search)
            } else {
              return message && message.text.includes(search)
            }
          })
        } else {
          filteredMessages = user.messages;
        }

        if (offset >= filteredMessages.length) {
          ctx.response.body = JSON.stringify({ messages: [] });
        } else {
          const messages = filteredMessages.slice(Math.max(0, filteredMessages.length - offset - 10), filteredMessages.length - offset);
          ctx.response.body = JSON.stringify({ messages: messages });
        }
      } else if (type === "favorite") {
        if (search !== "") {
          filteredMessages = user.messages.filter(message => {
            if (message.isFavorite) {
              if (message.type === "file" || message.type === "video" || message.type === "audio" || message.type === "image") {
                return message && message.file.includes(search)
              } else {
                return message && message.text.includes(search)
              }
            }
          })
        } else {
          filteredMessages = user.messages.filter(message => message.isFavorite)
        }

        if (offset >= filteredMessages.length) {
          ctx.response.body = JSON.stringify({ messages: [] });
        } else {
          const messages = filteredMessages.slice(Math.max(0, filteredMessages.length - offset - 10), filteredMessages.length - offset);
          ctx.response.body = JSON.stringify({ messages: messages });
        }
      } else {
        if (search !== "") {
          filteredMessages = user.messages.filter(message => {
            if (message.type === type) {
              if (message.type === "file" || message.type === "video" || message.type === "audio" || message.type === "image") {
                return message && message.file.includes(search)
              } else {
                return message && message.text.includes(search)
              }
            }
          })
        } else {
          filteredMessages = user.messages.filter(message => message.type === type)
        }

        if (offset >= filteredMessages.length) {
          ctx.response.body = JSON.stringify({ messages: [] });
        } else {
          const messages = filteredMessages.slice(Math.max(0, filteredMessages.length - offset - 10), filteredMessages.length - offset);
          ctx.response.body = JSON.stringify({ messages: messages });
        }
      }

      ctx.response.status = 200;
    }
  }
});

router.post("/categories", async (ctx, next) => {
  const { apiKey } = ctx.request.body;

  const types = ["text", "link", "image", "audio", "video", "file", "favorite"];
  let obj = [];

  for (const user of users) {
    if (user.apiKey === apiKey) {
      for (const type of types) {
        if (type === "favorite") {
          const typeAmount = user.messages.filter(message => message.isFavorite).length;
          obj = [...obj, { type: type, amount: typeAmount }];
        } else {
          const typeAmount = user.messages.filter(message => message.type === type).length;
          obj = [...obj, { type: type, amount: typeAmount }];
        }
      };
    }
  }

  ctx.response.body = JSON.stringify({ types: obj });
  ctx.response.status = 200;
});

router.post("/new-message", async (ctx, next) => {
  const { apiKey, message } = ctx.request.body;

  if (message.text && message.text.startsWith("@chaos")) {
    if (commands.find(command => command === message.text)) {
      if (message.text === commands[0]) {
        const newText = `Список доступных команд: \n@chaos помощь - показывает полный список доступных команд, \n@chaos картинка - отправляет случайное изображение животного, \n@chaos рецепт - отправляет случайный рецепт с названием, категорией, описанием и инструкцией по приготовлению`;
        for (const user of users) {
          if (user.apiKey === apiKey) {
            user.messages.push({ ...message, text: newText });
          }
        }

        ctx.response.body = JSON.stringify({ success: true, message: newText });
        ctx.response.status = 200;
      } else if (message.text === commands[1]) {
        const types = ["cat", "dog", "fox", "bird", "alpaca"];
        const randomType = types[Math.floor(Math.random() * types.length)];

        try {
          const data = await random[randomType]();

          const botMessage = {
            id: message.id,
            author: message.author,
            type: message.type,
            created: message.created,
            isFavorite: message.isFavorite,
            isPinned: message.isPinned,
            file: data.message
          };

          for (const user of users) {
            if (user.apiKey === apiKey) {
              user.messages.push(botMessage);
            }
          }

          ctx.response.body = JSON.stringify({ success: true, message: data.message });
          ctx.response.status = 200;
        } catch (error) {
          console.error("Error fetching random animal:", error);
          ctx.response.body = JSON.stringify({ success: false, message: "Ошибка при получении изображения." });
          ctx.response.status = 500;
        }
      } else if (message.text === commands[2]) {
        const recipesPath = path.join(__dirname, "data", "recipes.json");

        function readRecipes() {
          return new Promise((resolve, reject) => {
            fs.readFile(recipesPath, "utf8", (err, data) => {
              if (err) {
                return reject(err);
              }
              resolve(JSON.parse(data));
            });
          });
        }

        try {
          const recipes = await readRecipes();
          const randomRecipe = recipes[Math.floor(Math.random() * recipes.length)];
          const recipeMessage = `Рецепт: ${randomRecipe.title}\nКатегория: ${randomRecipe.category}\nОписание: ${randomRecipe.description}\nКак приготовить: ${randomRecipe.instructions}`;

          for (const user of users) {
            if (user.apiKey === apiKey) {
              user.messages.push({ ...message, text: recipeMessage });
            }
          }

          ctx.response.body = JSON.stringify({ success: true, message: recipeMessage });
          ctx.response.status = 200;
        } catch (error) {
          console.error("Ошибка при чтении рецептов:", error);
          ctx.response.body = JSON.stringify({ success: false, message: "Ошибка при получении рецептов." });
          ctx.response.status = 500;
        }
      }
    } else {
      ctx.response.body = JSON.stringify({ success: false, message: "Такой команды не существует. Чтобы посмотреть список доступных вам команд, введите @chaos помощь" });
      ctx.response.status = 200;
    }
  } else {
    for (const user of users) {
      if (user.apiKey === apiKey) {
        user.messages.push(message);
      }
    }

    ctx.response.body = JSON.stringify({ success: true });
    ctx.response.status = 200;
  }
});

router.post("/video-image", async (ctx, next) => {
  const { filename, apiKey } = ctx.request.body;

  const decodedApiKey = decodeURIComponent(apiKey);

  const user = users.find(user => user.apiKey === decodedApiKey);

  if (!user) {
    console.log('Username not found');
    ctx.response.status = 404;
    ctx.response.body = JSON.stringify({ error: "User not found" });
    return;
  }

  const username = user.username;

  try {
    const process = new ffmpeg(`./public/${username}/${filename}`);
    process.then(function (video) {
      video.fnExtractFrameToJPG(`./public/${username}`, {
        frame_rate: 1,
        number: 1,
        file_name: `${filename.split(".")[0]}`
      }, function (error, files) {
        if (!error) {
          console.log("Image successfully created");
          ctx.response.body = JSON.stringify({ filename: `${filename.split(".")[0]}_1.jpg` });
          ctx.response.status = 200;
        } else {
          console.error("Error creating image:", error);
          ctx.response.status = 500;
          ctx.response.body = JSON.stringify({ error: "Error creating image" });
        }
      });
    }, function (err) {
      console.log("Error: " + err);
      ctx.response.status = 500;
      ctx.response.body = JSON.stringify({ error: "Error processing video" });
    });
  } catch (e) {
    console.log(e.code);
    console.log(e.msg);
    ctx.response.status = 500;
    ctx.response.body = JSON.stringify({ error: "Internal server error" });
  }
});

router.post("/delete-message", async (ctx, next) => {
  const { apiKey, id, fileName } = ctx.request.body;

  for (const user of users) {
    if (user.apiKey === apiKey) {
      user.messages = user.messages.filter(message => message.id !== id);
    }
  }

  if (fileName) {
    const username = users.find(user => user.apiKey === apiKey).username;

    const filePath = path.join(__dirname, "public", username, fileName);

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Error:", err);
        ctx.response.status = 500;
        ctx.response.body = { message: err };
        return;
      }
      console.log("success");
    });
  }

  ctx.response.status = 200;
});

router.post("/register", async (ctx) => {
  const { username, password } = ctx.request.body;

  for (const user of users) {
    if (user.username === username) {
      ctx.response.body = JSON.stringify({ success: false, message: "Такое имя пользователя уже существует." });
      ctx.response.status = 200;
      return;
    }
  }

  const obj = {
    username: username,
    password: password,
    apiKey: generateApiKey(),
    messages: [{
      id: uuidv4(),
      author: "bot",
      type: "text",
      created: Date.now(),
      isFavorite: false,
      isPinned: false,
      text: `Привет! \nНемного о приложении: я являюсь органайзером-чатботом, где вы можете хранить заметки, файлы, видео, аудио, изображения, ссылки, а также обращаться ко мне с различными командами. Список доступных на данный момент команд: \n@chaos помощь, \n@chaos картинка, \n@chaos рецепт. \nВы также можете скачивать, удалять, добавлять в избранное и закреплять сообщения, а также пользоваться поиском. Присутствует просмотр вложений по категориям. \nУдачи!`
    }]
  };

  users.push(obj);

  ctx.response.body = JSON.stringify({ success: true, apiKey: obj.apiKey });
  ctx.response.status = 200;
});

router.post("/login", async (ctx, next) => {
  const { username, password, apiKey } = ctx.request.body;
  let selectedUser;

  const decodedApiKey = decodeURIComponent(apiKey);

  if (apiKey) {
    for (const user of users) {
      if (user.apiKey === decodedApiKey) {
        selectedUser = user;
      }
    }

    if (!selectedUser) {
      ctx.response.body = JSON.stringify({ success: false, message: "Неправильный API Key." });
    } else {
      ctx.response.body = JSON.stringify({ success: true });
    }
  } else {
    for (const user of users) {
      if (user.username === username && user.password === password) {
        selectedUser = user;
      }
    }

    if (!selectedUser) {
      ctx.response.body = JSON.stringify({ success: false, message: "Неправильное имя пользователя или пароль." });
      ctx.response.status = 200;
    } else {
      ctx.response.body = JSON.stringify({ success: true, apiKey: selectedUser.apiKey, username: selectedUser.username });
      ctx.response.status = 200;
    }
  }
});

router.post("/upload/:apiKey", async (ctx) => {
  const apiKey = ctx.params.apiKey;
  const file = ctx.request.files.file;

  const username = users.find(user => user.apiKey === apiKey).username;

  if (!file) {
    ctx.throw(400, "Файл не был загружен");
    return;
  }

  const oldPath = file.filepath;
  const newPath = path.join(__dirname, "public", username, file.originalFilename || file.newFilename);

  const userDir = path.join(__dirname, "public", username);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  fs.renameSync(oldPath, newPath);

  console.log("success")

  ctx.response.status = 200;
});

router.post("/favorite", async (ctx, next) => {
  const { apiKey, id, isFavorite } = ctx.request.body;

  for (const user of users) {
    if (user.apiKey === apiKey) {
      for (const message of user.messages) {
        if (message.id === id) {
          message.isFavorite = isFavorite;
        }
      }
    }
  }

  ctx.response.status = 200;
});

router.post("/pinned", async (ctx, next) => {
  const { apiKey, id, isPinned } = ctx.request.body;

  for (const user of users) {
    if (user.apiKey === apiKey) {
      for (const message of user.messages) {
        if (message.id === id) {
          message.isPinned = isPinned;
        }
      }
    }
  }

  ctx.response.status = 200;
});

router.post("/delete-pinned", async (ctx, next) => {
  const { apiKey, fileName } = ctx.request.body;

  for (const user of users) {
    if (user.apiKey === apiKey) {
      for (const message of user.messages) {
        if (message.isPinned) {
          message.isPinned = false;
        }
      }
    }
  }

  if (fileName) {
    const username = users.find(user => user.apiKey === apiKey).username;

    const filePath = path.join(__dirname, "public", username, fileName);

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Error:", err);
        ctx.response.status = 500;
        ctx.response.body = { message: err };
        return;
      }
      console.log("success");
    });
  }

  ctx.response.status = 200;
});

router.post("/get-pinned", async (ctx, next) => {
  const { apiKey } = ctx.request.body;

  for (const user of users) {
    if (user.apiKey === apiKey) {
      const pinnedMessage = user.messages.find(message => message.isPinned);
      ctx.response.body = JSON.stringify({ message: pinnedMessage || undefined });
      ctx.response.status = 200;
      return;
    }
  }

  ctx.response.body = JSON.stringify({ message: undefined });
  ctx.response.status = 200;
});

app.use(router.routes()).use(router.allowedMethods());

const port = process.env.PORT || 7070;
const server = http.createServer(app.callback())

server.listen(port, (err) => {
  if (err) {
    console.log(err);

    return;
  }
  console.log("Server is listening to " + port);
});;