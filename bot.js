"use strict";

/**
 * Munich Scavenger Hunt Telegram Bot
 * ----------------------------------
 * This bot guides players through a city-based scavenger hunt and stores
 * progress in a Google Spreadsheet.
 *
 * This version is functionally identical to the original implementation.
 * The changes are limited to:
 * - clearer structure
 * - consistent formatting
 * - descriptive comments
 * - JSDoc-style documentation
 * - improved readability for repository presentation
 */

require("dotenv").config();

const fs = require("fs");
const Telegraf = require("telegraf");
const session = require("telegraf/session");
const Stage = require("telegraf/stage");
const Scene = require("telegraf/scenes/base");
const { GoogleSpreadsheet } = require("google-spreadsheet");

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

/**
 * Static scavenger-hunt content loaded from disk.
 * Each entry represents one station or final message block.
 */
const envelopesJSON = JSON.parse(fs.readFileSync("envelopes.json", "utf8"));

/**
 * Required environment variables for startup.
 * The bot exits immediately if any of these are missing.
 */
const REQUIRED_ENV = ["TELEGRAM_TOKEN", "GOOGLE_SPREADSHEET_ID"];

/**
 * Intro message shown when a user starts the bot.
 */
const startMessage = `
Greetings traveller! You just arrived in Munich a few days or weeks ago I assume. The city can seem big and scary at first. But do not worry! With some navigational skills as well as some simple math I will guide you through the historical core of the city on this year's inner city Scavenger Hunt.
To start the Scavenger Hunt enter /newgame.
For all available commands enter /help.
Please make sure you have registered a Telegram username to be able to participate in the Scavenger Hunt.
If you encounter any problems or unusual behaviour, please contact the maintainer of this demo bot.`;

/**
 * Penalty duration in seconds after too many wrong answers.
 * Falls back to 1800 seconds (= 30 minutes).
 */
const PENALTY_SECONDS = parseInt(process.env.PENALTY_SECONDS || "1800", 10);

/**
 * The configured correct answer order taken from the environment.
 * Example format: "3,5,2,8,..."
 */
const envelopeOrder = parseEnvelopeOrder(process.env.ENVELOPE_ORDER);

/**
 * Number of playable answer stations.
 * It is capped by both the scavenger-hunt data and the configured answer order.
 */
const ANSWER_COUNT = Math.min(envelopesJSON.length - 1, envelopeOrder.length);

/* -------------------------------------------------------------------------- */
/*                             Environment Validation                         */
/* -------------------------------------------------------------------------- */

const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
    console.error(
        `Missing required environment variables: ${missingEnv.join(", ")}`,
    );
    process.exit(1);
}

/* -------------------------------------------------------------------------- */
/*                           Bot / Session / Scenes Setup                     */
/* -------------------------------------------------------------------------- */

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const stage = new Stage();

/**
 * Main gameplay scene.
 * Users enter this scene when actively playing a scavenger hunt.
 */
const game = new Scene("game");

/**
 * Decision scene for users who already have a saved game.
 * They can either resume or overwrite it with a new run.
 */
const existingGame = new Scene("existingGame");

stage.register(game);
stage.register(existingGame);

bot.use(session());
bot.use(stage.middleware());

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                              */
/* -------------------------------------------------------------------------- */

/**
 * Parses the ENVELOPE_ORDER environment variable into an array of numbers.
 *
 * @param {string | undefined} value - Raw environment variable value.
 * @returns {number[]} Parsed envelope order.
 */
function parseEnvelopeOrder(value) {
    if (!value) {
        console.error("ENVELOPE_ORDER is missing.");
        process.exit(1);
    }

    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => parseInt(entry, 10));
}

/**
 * Builds the Google service-account credential object from environment
 * variables. The private key is normalized so escaped line breaks work.
 *
 * @returns {object} Google service-account credentials.
 */
function getGoogleCredentials() {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
        ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
        : undefined;

    return {
        type: process.env.GOOGLE_ACCOUNT_TYPE || "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri:
            process.env.GOOGLE_AUTH_URI ||
            "https://accounts.google.com/o/oauth2/auth",
        token_uri:
            process.env.GOOGLE_TOKEN_URI ||
            "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url:
            process.env.GOOGLE_AUTH_PROVIDER_CERT_URL ||
            "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    };
}

/**
 * Returns a connected spreadsheet instance and ensures the expected sheet
 * structure is present before use.
 *
 * Expected sheet order:
 * 0 -> saves
 * 1 -> ladder
 * 2 -> penalty
 *
 * @returns {Promise<GoogleSpreadsheet>} Initialized spreadsheet document.
 */
async function getDoc() {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID);
    await doc.useServiceAccountAuth(getGoogleCredentials());
    await doc.loadInfo();
    await ensureSheetSchemas(doc);
    return doc;
}

/**
 * Verifies that the spreadsheet contains the required sheets and normalizes
 * header rows if necessary.
 *
 * @param {GoogleSpreadsheet} doc - Spreadsheet document.
 * @returns {Promise<void>}
 */
async function ensureSheetSchemas(doc) {
    const saves = doc.sheetsByIndex[0];
    const ladder = doc.sheetsByIndex[1];
    const penalty = doc.sheetsByIndex[2];

    if (!saves || !ladder || !penalty) {
        throw new Error(
            "Spreadsheet must contain exactly these sheets in order: saves, ladder, penalty.",
        );
    }

    const saveHeaders = normalizeHeaderValues(saves.headerValues);
    if (saveHeaders.join("|") !== "Player|Level|PenaltyCount") {
        await saves.setHeaderRow(["Player", "Level", "PenaltyCount"]);
    }

    const ladderHeaders = normalizeHeaderValues(ladder.headerValues);
    if (ladderHeaders.join("|") !== "Position|Player") {
        await ladder.setHeaderRow(["Position", "Player"]);
    }

    const penaltyHeaders = normalizeHeaderValues(penalty.headerValues);
    if (penaltyHeaders.join("|") !== "Player|Time") {
        await penalty.setHeaderRow(["Player", "Time"]);
    }
}

/**
 * Normalizes spreadsheet header values for safe comparison.
 *
 * @param {string[] | undefined} values - Raw header values.
 * @returns {string[]} Trimmed header values.
 */
function normalizeHeaderValues(values) {
    return (values || []).map((value) => String(value || "").trim());
}

/**
 * Ensures the Telegram user has a username, which is required to identify
 * their game state in storage.
 *
 * @param {object} ctx - Telegraf context.
 * @returns {boolean} True if the user has a username, otherwise false.
 */
function requireUsername(ctx) {
    if (ctx.from && ctx.from.username) {
        return true;
    }

    ctx.reply(
        'It appears that you have not registered a Telegram username. Please set one under "Telegram > Settings" before participating in the Scavenger Hunt.',
    );
    return false;
}

/**
 * Returns the clue/task text for the player's current station.
 *
 * @param {number} level - Current player level.
 * @returns {string} Station text.
 */
function currentStationText(level) {
    const entry = envelopesJSON[level];

    if (!entry) {
        return "No further station data available.";
    }

    if (entry.task) {
        return `${entry.clue}\n\n${entry.task}`;
    }

    return entry.clue || entry.info || "No station text available.";
}

/**
 * Builds a progress message for the player.
 *
 * @param {number} level - Current player level.
 * @returns {string} Human-readable progress text.
 */
function completedStationsText(level) {
    return `You have completed ${Math.min(level, ANSWER_COUNT)} out of ${ANSWER_COUNT} stations.`;
}

/**
 * Generic fatal error handler for user-facing bot operations.
 *
 * @param {object} ctx - Telegraf context.
 * @param {Error} error - Original error.
 * @returns {Promise<void>}
 */
async function handleFatalError(ctx, error) {
    console.error(error);
    await ctx.reply(
        "Something went wrong while accessing the bot data. Please try again in a moment.",
    );
}

/* -------------------------------------------------------------------------- */
/*                           Spreadsheet Data Access                          */
/* -------------------------------------------------------------------------- */

/**
 * Checks whether a saved game exists for a given player.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<boolean>} True if a save exists.
 */
async function gameFound(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    return rows.some(
        (row) => String(row._rawData[0] || row.Player || "") === playerName,
    );
}

/**
 * Saves or updates a player's game state.
 *
 * @param {string} playerName - Telegram username.
 * @param {number} playerLevel - Current level.
 * @param {number} penaltyCount - Current wrong-attempt counter.
 * @returns {Promise<void>}
 */
async function saveGame(playerName, playerLevel, penaltyCount) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    let playerFound = false;

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            row.Player = playerName;
            row.Level = Number(playerLevel);
            row.PenaltyCount = Number(penaltyCount);
            row._rawData[0] = playerName;
            row._rawData[1] = Number(playerLevel);
            row._rawData[2] = Number(penaltyCount);
            await row.save();
            playerFound = true;
            break;
        }
    }

    if (!playerFound) {
        await sheet.addRow({
            Player: playerName,
            Level: Number(playerLevel),
            PenaltyCount: Number(penaltyCount),
        });
    }
}

/**
 * Loads a player's saved game.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<{player: string, level: number, penaltyCount: number} | null>}
 */
async function loadGame(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            return {
                player: String(row._rawData[0] || row.Player),
                level: parseInt(row._rawData[1] || row.Level || "0", 10),
                penaltyCount: parseInt(
                    row._rawData[2] || row.PenaltyCount || "0",
                    10,
                ),
            };
        }
    }

    return null;
}

/**
 * Deletes a player's saved game after completion or manual reset.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<void>}
 */
async function deleteGame(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            await row.delete();
            break;
        }
    }
}

/**
 * Reads the public ladder / ranking list from the spreadsheet and formats it.
 *
 * @returns {Promise<string>} Ladder text.
 */
async function parseLadder() {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[1];
    const rows = await sheet.getRows();

    let ladderString = "";

    for (const row of rows) {
        const position = row._rawData[0] || row.Position;
        const player = row._rawData[1] || row.Player;

        ladderString += player
            ? `Place ${position}: ${player}\n`
            : `Place ${position}: \n`;
    }

    return ladderString.trim();
}

/**
 * Adds a player to the ladder if they are not already listed.
 * The first empty slot is used; otherwise a new row is appended.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<void>}
 */
async function addPlayerToLadder(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[1];
    const rows = await sheet.getRows();

    for (const row of rows) {
        if (String(row._rawData[1] || row.Player || "") === playerName) {
            return;
        }

        if (!row._rawData[1] && !row.Player) {
            row.Player = playerName;
            row._rawData[1] = playerName;
            await row.save();
            return;
        }
    }

    await sheet.addRow({ Position: rows.length + 1, Player: playerName });
}

/**
 * Stores or updates a player's penalty timestamp.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<void>}
 */
async function setPenalty(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[2];
    const rows = await sheet.getRows();
    const date = new Date().toISOString();

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            row.Time = date;
            row._rawData[1] = date;
            await row.save();
            return;
        }
    }

    await sheet.addRow({ Player: playerName, Time: date });
}

/**
 * Checks whether a player is currently under an active penalty.
 * Expired penalties are automatically removed.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<boolean>} True if a penalty is still active.
 */
async function checkPenalty(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[2];
    const rows = await sheet.getRows();
    const currentDate = new Date();

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            const penaltyDate = new Date(row._rawData[1] || row.Time);
            const difference = Math.floor(
                (currentDate.getTime() - penaltyDate.getTime()) / 1000,
            );

            if (difference < PENALTY_SECONDS) {
                return true;
            }

            await removePenalty(playerName);
            return false;
        }
    }

    return false;
}

/**
 * Removes a player's penalty entry from the spreadsheet.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<void>}
 */
async function removePenalty(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[2];
    const rows = await sheet.getRows();

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            await row.delete();
            break;
        }
    }
}

/**
 * Returns the remaining penalty time in a human-readable format.
 *
 * @param {string} playerName - Telegram username.
 * @returns {Promise<string>} Remaining time string.
 */
async function getRemainingPenaltyTime(playerName) {
    const doc = await getDoc();
    const sheet = doc.sheetsByIndex[2];
    const rows = await sheet.getRows();
    const currentDate = new Date();

    for (const row of rows) {
        if (String(row._rawData[0] || row.Player || "") === playerName) {
            const penaltyDate = new Date(row._rawData[1] || row.Time);
            const difference = Math.floor(
                (currentDate.getTime() - penaltyDate.getTime()) / 1000,
            );
            const pendingTime = Math.max(PENALTY_SECONDS - difference, 0);
            const minutes = Math.floor(pendingTime / 60);
            const seconds = pendingTime % 60;

            return `${minutes} minutes and ${seconds} seconds`;
        }
    }

    return "0 minutes and 0 seconds";
}

/* -------------------------------------------------------------------------- */
/*                              Global Commands                               */
/* -------------------------------------------------------------------------- */

/**
 * /start
 * Shows the introductory message.
 */
bot.start((ctx) => ctx.reply(startMessage));

/**
 * /help
 * Lists all available commands.
 */
bot.command("help", (ctx) => {
    ctx.reply(`Here is a list of all available commands:
/help - List all commands
/newgame - Start a new Scavenger Hunt
/resumegame - Resume your Scavenger Hunt
/endgame - End your current Scavenger Hunt
/ladder - Show the first ten players to finish the Scavenger Hunt
/clue - Show the current clue
/showprogress - Show how far you have gotten on your Scavenger Hunt
/info - Show interesting facts about your current station`);
});

/**
 * /ladder
 * Shows the current ranking list.
 */
bot.command("ladder", async (ctx) => {
    try {
        const ladder = await parseLadder();
        ctx.reply(`Here is the current ladder:\n${ladder}`);
    } catch (error) {
        handleFatalError(ctx, error);
    }
});

/**
 * /newgame
 * Starts a new game if none exists.
 * If a save already exists, the user is sent into the "existingGame" scene.
 */
bot.command("newgame", async (ctx) => {
    if (!requireUsername(ctx)) return;

    try {
        const found = await gameFound(ctx.from.username);

        if (!found) {
            ctx.session.save = {
                player: ctx.from.username,
                level: 0,
                penaltyCount: 0,
            };

            await saveGame(
                ctx.session.save.player,
                ctx.session.save.level,
                ctx.session.save.penaltyCount,
            );

            ctx.reply("Starting new game. Get ready for your first clue.");
            ctx.scene.enter("game");
            return;
        }

        ctx.reply(
            'It seems like you have not finished an existing Scavenger Hunt.\nEnter "resume" to continue it.\nEnter "new" to start over. Your old progress will be lost.',
        );
        ctx.scene.enter("existingGame");
    } catch (error) {
        handleFatalError(ctx, error);
    }
});

/**
 * /resumegame
 * Restores an existing save and enters the main game scene.
 */
bot.command("resumegame", async (ctx) => {
    if (!requireUsername(ctx)) return;

    try {
        const found = await gameFound(ctx.from.username);

        if (!found) {
            ctx.reply(
                "No saved game was found for your Telegram username. Start a new game with /newgame.",
            );
            return;
        }

        const savedGame = await loadGame(ctx.from.username);
        ctx.session.save = savedGame;
        ctx.reply(
            "Game found. Your Scavenger Hunt will be resumed. Here is your clue:",
        );
        ctx.scene.leave();
        ctx.scene.enter("game");
    } catch (error) {
        handleFatalError(ctx, error);
    }
});

/**
 * /clue
 * Outside the game scene, this reminds the user to start or resume a game.
 */
bot.command("clue", (ctx) => {
    ctx.reply("Please enter a game by using /newgame or /resumegame.");
});

/**
 * /showprogress
 * Displays progress if a saved game exists.
 */
bot.command("showprogress", async (ctx) => {
    if (!requireUsername(ctx)) return;

    try {
        const game = await loadGame(ctx.from.username);

        if (!game) {
            ctx.reply("No active game found. Start one with /newgame.");
            return;
        }

        ctx.reply(completedStationsText(game.level));
    } catch (error) {
        handleFatalError(ctx, error);
    }
});

/**
 * /info
 * Outside the active game scene, this reminds the user that they must be in a game.
 */
bot.command("info", (ctx) => {
    ctx.reply("Please enter a game before using this command.");
});

/* -------------------------------------------------------------------------- */
/*                          Scene: existingGame                               */
/* -------------------------------------------------------------------------- */

/**
 * Handles user input after /newgame when a save already exists.
 *
 * Accepted text inputs:
 * - "resume" -> continue existing game
 * - "new"    -> overwrite progress and start from the beginning
 */
existingGame.on("text", async (ctx) => {
    if (!requireUsername(ctx)) return;

    try {
        if (ctx.message.text === "resume") {
            const savedGame = await loadGame(ctx.from.username);

            if (!savedGame) {
                ctx.reply(
                    "No previous game was found anymore. Please start a new one with /newgame.",
                );
                ctx.scene.leave();
                return;
            }

            ctx.session.save = savedGame;
            ctx.reply(
                "Your old Scavenger Hunt will be resumed.\nHere is your last clue:",
            );
            ctx.scene.leave();
            ctx.scene.enter("game");
            return;
        }

        if (ctx.message.text === "new") {
            const savedGame = await loadGame(ctx.from.username);

            ctx.session.save = {
                player: ctx.from.username,
                level: 0,
                penaltyCount: savedGame ? savedGame.penaltyCount : 0,
            };

            await saveGame(
                ctx.session.save.player,
                ctx.session.save.level,
                ctx.session.save.penaltyCount,
            );

            ctx.reply(
                "You have started a new Scavenger Hunt.\nYour old progress has been replaced.\nHere is your first clue:",
            );
            ctx.scene.leave();
            ctx.scene.enter("game");
            return;
        }

        ctx.reply('Please enter either "resume" or "new".');
    } catch (error) {
        handleFatalError(ctx, error);
    }
});

/* -------------------------------------------------------------------------- */
/*                              Scene: game                                   */
/* -------------------------------------------------------------------------- */

/**
 * Triggered whenever the player enters the main game scene.
 * Immediately sends the current clue.
 */
game.enter((ctx) => {
    if (!ctx.session.save) {
        ctx.reply("No active game found. Start one with /newgame.");
        ctx.scene.leave();
        return;
    }

    ctx.reply(currentStationText(ctx.session.save.level));
});

/**
 * Main game loop:
 * - handles scene-local commands
 * - validates answers
 * - manages penalties
 * - advances progression
 * - finalizes the game
 */
game.on("text", async (ctx) => {
    if (!requireUsername(ctx)) return;

    if (!ctx.session.save) {
        ctx.reply("No active game found. Start one with /newgame.");
        ctx.scene.leave();
        return;
    }

    try {
        const text = String(ctx.message.text).trim();

        /* ---------------------------- Scene-local commands --------------------------- */

        if (text === "/endgame") {
            await saveGame(
                ctx.session.save.player,
                ctx.session.save.level,
                ctx.session.save.penaltyCount,
            );
            ctx.reply(
                "Leaving the current Scavenger Hunt. Your progress has been saved.",
            );
            ctx.scene.leave();
            return;
        }

        if (text === "/newgame") {
            ctx.reply("Your Scavenger Hunt is already in progress.");
            return;
        }

        if (text === "/ladder") {
            const ladder = await parseLadder();
            ctx.reply(`Here is the current ladder:\n${ladder}`);
            return;
        }

        if (text === "/help") {
            ctx.reply(`Here is a list of all available commands:
/help - List all commands
/newgame - Start a new Scavenger Hunt
/resumegame - Resume your Scavenger Hunt
/endgame - End your current Scavenger Hunt
/ladder - Show the first ten players to finish the Scavenger Hunt
/clue - Show the current clue
/showprogress - Show how far you have gotten on your Scavenger Hunt
/info - Show interesting facts about your current station`);
            return;
        }

        if (text === "/clue") {
            ctx.reply(
                `Here is your current clue:\n\n${currentStationText(ctx.session.save.level)}`,
            );
            return;
        }

        if (text === "/showprogress") {
            ctx.reply(completedStationsText(ctx.session.save.level));
            return;
        }

        if (text === "/info") {
            if (ctx.session.save.level > 0) {
                ctx.reply(envelopesJSON[ctx.session.save.level - 1].info);
            } else {
                ctx.reply(
                    "No station has been completed yet, so there is no info text to show.",
                );
            }
            return;
        }

        /* ----------------------------- Penalty checking ------------------------------ */

        const penaltyActive = await checkPenalty(ctx.from.username);

        if (penaltyActive) {
            const time = await getRemainingPenaltyTime(ctx.from.username);

            if (ctx.session.save.penaltyCount !== 0) {
                ctx.session.save.penaltyCount = 0;
                await saveGame(
                    ctx.session.save.player,
                    ctx.session.save.level,
                    ctx.session.save.penaltyCount,
                );
            }

            ctx.reply(`Your penalty is still pending. Please wait ${time}.`);
            return;
        }

        /* ---------------------------- Answer verification ---------------------------- */

        const expectedAnswer = String(envelopeOrder[ctx.session.save.level]);

        if (text === expectedAnswer) {
            ctx.session.save.level += 1;
            ctx.session.save.penaltyCount = 0;

            await saveGame(
                ctx.session.save.player,
                ctx.session.save.level,
                ctx.session.save.penaltyCount,
            );

            /* --------------------------- Game completion case -------------------------- */

            if (ctx.session.save.level >= ANSWER_COUNT) {
                const finalEntry = envelopesJSON[ANSWER_COUNT];

                if (finalEntry) {
                    const finalText = [finalEntry.clue, finalEntry.task]
                        .filter(Boolean)
                        .join("\n\n");

                    if (finalText) {
                        ctx.reply(finalText);
                    }
                }

                ctx.reply(
                    "Congratulations! You have successfully finished the Scavenger Hunt.",
                );
                await addPlayerToLadder(ctx.session.save.player);
                await deleteGame(ctx.session.save.player);
                ctx.scene.leave();
                return;
            }

            /* ------------------------- Normal correct-answer case ---------------------- */

            ctx.reply(
                `Congrats! Your answer is right.\nUse /info to learn more about your completed station.\nHere is the next clue:\n\n${currentStationText(
                    ctx.session.save.level,
                )}`,
            );
            return;
        }

        /* ----------------------------- Wrong answer case ----------------------------- */

        ctx.session.save.penaltyCount += 1;

        await saveGame(
            ctx.session.save.player,
            ctx.session.save.level,
            ctx.session.save.penaltyCount,
        );

        if (ctx.session.save.penaltyCount > 2) {
            await setPenalty(ctx.from.username);
            ctx.session.save.penaltyCount = 0;

            await saveGame(
                ctx.session.save.player,
                ctx.session.save.level,
                ctx.session.save.penaltyCount,
            );

            const time = await getRemainingPenaltyTime(ctx.from.username);
            ctx.reply(
                `Too many wrong attempts. A penalty has been activated for ${time}.`,
            );
            return;
        }

        ctx.reply("Your number is incorrect. Try again.");
    } catch (error) {
        handleFatalError(ctx, error);
    }
});

/* -------------------------------------------------------------------------- */
/*                              Bot Bootstrap                                 */
/* -------------------------------------------------------------------------- */

/**
 * Starts the bot either in polling mode or webhook mode.
 *
 * Webhook mode requires:
 * - PUBLIC_URL
 * - PORT
 *
 * Default mode:
 * - polling
 */
function startBot() {
    const deploymentMode = (
        process.env.DEPLOYMENT_MODE || "polling"
    ).toLowerCase();

    if (deploymentMode === "webhook") {
        if (!process.env.PUBLIC_URL || !process.env.PORT) {
            console.error(
                "Webhook mode requires PUBLIC_URL and PORT to be set.",
            );
            process.exit(1);
        }

        const webhookPath = `/bot${process.env.TELEGRAM_TOKEN}`;
        bot.telegram.setWebhook(`${process.env.PUBLIC_URL}${webhookPath}`);
        bot.startWebhook(webhookPath, null, parseInt(process.env.PORT, 10));
        console.log(`Bot started in webhook mode on port ${process.env.PORT}.`);
        return;
    }

    bot.launch();
    console.log("Bot started in polling mode.");
}

/* -------------------------------------------------------------------------- */
/*                             Process Lifecycle                              */
/* -------------------------------------------------------------------------- */

startBot();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
