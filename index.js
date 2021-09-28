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


const PORT = 8001;

// Static files
// app.use(express.static("public"));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


const players = new Map();
const games = new Map();


var UNIQUE_RETRIES = 9999;

var generateUnique = function () {
    var retries = 0;
    var id;

    while (!id && retries < UNIQUE_RETRIES) {
        id = generate();
        if (games.has(id)) {
            id = null;
            retries++;
        }
    }

    return id;
};

// var ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
var ALPHABET = '0123456789';

var ID_LENGTH = 4;

var generate = function () {
    var rtn = '';
    for (var i = 0; i < ID_LENGTH; i++) {
        rtn += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return rtn;
}

io.on('connection', (socket) => {

    const player = {
        id: socket.id,
        ready: false,
    };

    let game;

    console.log('a player connected ', player.id);

    players.set(socket.id, player);


    function emitGameState() {
        console.log('emitGameState()');
        if (!game) return;
        console.log('game.state:', game);
        io.sockets.in(game.id).emit('gameState', game);
    }

    async function initEmitGameStateLoop() {
        while (game) {
            await new Promise(resolve => setTimeout(resolve, game.playing ? 2000 : 2000));
            emitGameState();
        }
    }

    socket.on('createGame', () => {
        console.log('createGame');

        game = {
            id: generateUnique(),
            hostedBy: player.id,
            players: [
                player
            ],
            playing: false
        };

        games.set(game.id, game);

        socket.join(game.id);

        emitGameState();

        initEmitGameStateLoop();
    });


    socket.on('joinGame', (gameId) => {
        console.log('joinGame', gameId);

        if (!games.has(gameId)) return;

        game = games.get(gameId);

        game.players.push(player);

        socket.join(game.id);

        emitGameState();
    });

    socket.on('ready', () => {
        console.log('ready', player.id, game.id);

        player.ready = !player.ready;

        if (!game.players.find((player) => !player.ready)) {
            console.log('All Ready!')
            game.playing = true;
        }
        emitGameState();
    });

    socket.on('playingGameState', (playingGameState) => {
        console.log('playingGameState', playingGameState);

        game.playingState = playingGameState;
    });

    socket.on('attachPathToPendingUnit', (path) => {
        console.log('attachPathToPendingUnit', path);
        io.to(game.hostedBy).emit('attachPathToPendingUnit', path);
    });

    socket.on('disconnect', () => {
        console.log('player disconnected ', player.id);
        players.delete(player.id);
        emitGameState();
    });
});

server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});







