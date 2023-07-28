const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const {Server} = require("socket.io");
const io = new Server(server);
const {
    v1: uuidv1,
    v4: uuidv4,
} = require('uuid');


const HOST = '0.0.0.0';
const PORT = 8001;


// Static files
// app.use(express.static("public"));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


const players = new Map();
const games = new Map();
const invites = new Map();


const UNIQUE_RETRIES = 9999;
const generateUnique = function (map) {
    let retries = 0;
    let id;

    while (!id) {
        id = generate();
        if (map.has(id)) {
            id = null;
            retries++;
        }
        if (retries > UNIQUE_RETRIES) {
            throw new Error('generateUnique: too many retries')
        }
    }

    return id;
};
// const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHABET = '0123456789';
const ID_LENGTH = 4;
const generate = function () {
    let rtn = '';
    for (let i = 0; i < ID_LENGTH; i++) {
        rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return rtn;
}


// TODO: throttle everything, kick and ban abusive ip
io.on('connection', (socket) => {

    const player = {
        id: socket.id,
        name: '1',
        connected: true,
        ready: false,
    };

    let game;

    console.log('a player connected ', player.id);

    players.set(socket.id, player);

    function joinGame(gameId) {
        // if (gameId == '') {
        //     gameId = games.values().next().value?.id;
        //     // console.log('joining without id', games.values().next().value);
        //     // console.log('joining without id', gameId);
        // }

        // TODO: throw error?
        if (!games.has(gameId)) return;

        game = games.get(gameId);

        player.name = `${game.players.length + 1}`;

        // TODO: check player is not already in game
        // TODO: check there is free place for player
        if (game.players.length >= 2) return;

        game.players.push(player);

        socket.join(game.id);

        emitGameState();

        console.log(game);
    }

    function emitGameState() {
        // console.log('emitGameState()');
        if (!game) return;

        console.log(Date.now(), 'emitGameState:', game.id);

        // console.log('io.sockets.in(game.id):', io.sockets.in(game.id));

        // io.in(game.id).allSockets().then(result => {
        //     console.log(`io.sockets.in(${game.id}):`, result.size);
        // })

        // io.sockets.in(game.id).emit('gameState', game);
        io.in(game.id).emit('gameState', game);
    }

    // do game logic
    function gamePlay() {
        // check if players disconnected
        // TODO: add ability to reconnect, timeout
        if (!game.players.find((player) => player.connected)) {

            console.log('gamePlay() all players disconnected, removing game ', game.id);
            console.log(game);

            games.delete(game.id);

            // TODO: check for memory leaks

            // Clear game from memory
            game.players = [];
            game = undefined;
        }
    }

    // Mainly to keep things up to date in case there was a glitch or something.
    async function initEmitGameStateLoop() {
        while (game) {
            await new Promise((resolve) => {
                return setTimeout(resolve, 5000);
            });
            emitGameState();
            gamePlay();
        }
    }

    socket.on('createGame', () => {
        console.log('createGame');

        game = {
            id: generateUnique(games),
            hostedBy: player.id,
            players: [
                player
            ],
            playing: false
        };

        games.set(game.id, game);

        socket.join(game.id);

        emitGameState();

        void initEmitGameStateLoop();

        io.emit('gameCreated', game.id);

        console.log(game);
    });

    socket.on('invite', (callback) => {
        console.log('invite', game.id);
        console.log('typeof callback', typeof callback);
        callback = typeof callback == "function" ? callback : () => {};
        const inviteToken = generateUnique(invites);
        invites.set(inviteToken, game.id);
        // TODO: generate url for phones
        // if game is installed - open game
        // if not installed - go to android play store or apple store
        callback( inviteToken );
    })

    socket.on('acceptInvite', (inviteToken) => {
        console.log('acceptInvite', inviteToken);
        const gameId = invites.get(inviteToken);

        // TODO: throw errors
        if (!gameId) return;

        joinGame(gameId)
    })

    socket.on('joinGame', (gameId) => {
        console.log('joinGame', gameId);

        joinGame(gameId)
    });

    socket.on('ready', () => {
        console.log('ready', player.id, game?.id);

        player.ready = !player.ready;

        if (!game) return;

        if (!game.players.find((player) => !player.ready)) {
            console.log('All Ready!')
            game.playing = true;
        }

        emitGameState();
    });

    socket.on('playingGameState', (playingGameState) => {
        // console.log('playingGameState', playingGameState);

        game.playingState = playingGameState;
        emitGameState();
    });

    // From player2 to player1 (the host)
    socket.on('attachPathToPendingUnit', (path) => {
        console.log('attachPathToPendingUnit', path);
        io.to(game.hostedBy).emit('attachPathToPendingUnit', path);
    });

    // From player2 to player1 (the host)
    socket.on('gameAction', (action) => {
        console.log('gameAction', action);
        io.to(game.hostedBy).emit('gameAction', action);
    });

    socket.on('gameOver', () => {
        console.log('gameOver');

        game.playing = false;
        game.players.forEach((player) => player.ready = false);
    });

    socket.on('disconnect', () => {
        console.log('player disconnected ', player.id);
        players.delete(player.id);
        player.connected = false;
        emitGameState();
    });


    // for debugging
    socket.on('getStatus', () => {
        let getStatus = {
            games,
            players
        };

        console.log('getStatus', JSON.stringify(getStatus, replacer, 2));

        console.log('io.sockets', io.sockets.sockets);

        io.emit('getStatus', JSON.stringify(getStatus, replacer, 2));
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Listening on port ${PORT}`);
    console.log(`http://${HOST}:${PORT}`);
});


function replacer(key, value) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

function reviver(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }
    return value;
}
