import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
const PORT = process.env.PORT || 4000
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const userNames = new Set();
const games = new Map();
const moves = [
    ['paper', 'rock'],
    ['scissors', 'paper'],
    ['rock', 'scissors'],
];
io.on('connection', (socket) => {
    console.log('connected');
    socket.on('join-game', (username) => {
        var _a, _b;
        if (!username) {
            const errorMessage = 'username is required';
            return socket.emit('username-error', errorMessage);
        }
        const currentUsername = (_b = (_a = socket.data) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.username;
        if (userNames.has(username) && username !== currentUsername) {
            const errorMessage = 'username already taken';
            return socket.emit('username-error', errorMessage);
        }
        const user = { username, gameId: '' };
        socket.data.user = user;
        userNames.add(username);
        socket.emit('username-error', '');
        socket.emit('searching-status', 'searching');
        let hasAvailableGame = false;
        let currentGame = { users: [] };
        games.forEach((game, gameId) => {
            if (game.users.length === 1) {
                socket.data.user = Object.assign(Object.assign({}, socket.data.user), { gameId });
                hasAvailableGame = true;
                currentGame = Object.assign(Object.assign({}, game), { users: [...game.users, { id: socket.id, name: socket.data.user.username, score: 0, move: '' }] });
                games.set(gameId, currentGame);
            }
        });
        if (hasAvailableGame) {
            const [opponent, you] = currentGame.users;
            socket.to(opponent.id).emit('game-data', Object.assign(Object.assign({}, currentGame), { clientId: opponent.id }));
            socket.to((opponent.id)).emit('searching-status', 'found');
            socket.emit('game-data', Object.assign(Object.assign({}, currentGame), { clientId: you.id }));
            return socket.emit('searching-status', 'found');
        }
        const gameId = uuid();
        socket.data.user = Object.assign(Object.assign({}, socket.data.user), { gameId });
        const game = { allPlayed: false, gameOver: false, adminId: socket.id, users: [{ id: socket.id, name: socket.data.user.username, score: 0, move: '', winner: false }] };
        games.set(gameId, game);
    });
    socket.on('play-move', (move) => {
        var _a, _b;
        if (move) {
            const userId = socket.id;
            const gameId = (_b = (_a = socket.data) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.gameId;
            const game = games.get(gameId);
            if (!game)
                return;
            const { users } = game;
            users.forEach(user => {
                if (user.id !== userId)
                    socket.to(user.id).emit('game-data', Object.assign(Object.assign({}, game), { hasMadeMove: true, clientId: socket.id }));
            });
            const newUsers = users.map(user => {
                if (user.id === userId)
                    return Object.assign(Object.assign({}, user), { move });
                return user;
            });
            games.set(gameId, Object.assign(Object.assign({}, game), { users: newUsers }));
            play(gameId, userId);
        }
    });
    socket.on('new-round', () => {
        var _a, _b;
        const gameId = (_b = (_a = socket.data) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.gameId;
        const userId = socket.id;
        const game = games.get(gameId);
        if (!game)
            return;
        const { users } = game;
        const opponentUser = users.find(user => user.id !== userId);
        const resetUsers = users.map(user => {
            return Object.assign(Object.assign({}, user), { winner: false, move: '' });
        });
        const resetGame = Object.assign(Object.assign({}, game), { allPlayed: false, gamePlayed: false, winner: '', users: resetUsers, hasMadeMove: false });
        games.set(gameId, resetGame);
        console.log(resetGame);
        socket.to(opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.id).emit('game-data', Object.assign(Object.assign({}, resetGame), { clientId: opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.id }));
        socket.emit('game-data', Object.assign(Object.assign({}, resetGame), { clientId: userId }));
    });
    socket.on("disconnect", () => {
        var _a, _b, _c, _d;
        const userId = socket.id;
        const gameId = (_b = (_a = socket.data) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.gameId;
        const username = (_d = (_c = socket.data) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.username;
        if (!username || !gameId)
            return;
        const game = games.get(gameId);
        if (!game)
            return;
        const users = game.users;
        if (users.length > 1) {
            const currentUser = users.find(user => user.id === userId);
            const opponentUser = users.find(user => user.id !== userId);
            socket.to(opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.id).emit('opponent-disconnected', `${currentUser === null || currentUser === void 0 ? void 0 : currentUser.name} has left the game`);
        }
        games.delete(gameId);
        userNames.delete(username);
    });

    function play(gameId, userId) {
        const game = games.get(gameId);
        const { users } = game;
        const allPayed = users.every((user => user.move));
        console.log(users);
        if (allPayed) {
            const currentUser = users.find(user => user.id === userId);
            const opponentUser = users.find(user => user.id !== userId);
            if ((currentUser === null || currentUser === void 0 ? void 0 : currentUser.move) === (opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.move)) {
                socket.to(opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.id).emit('game-data', Object.assign(Object.assign({}, game), { clientId: opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.id, hasMadeMove: true, gamePlayed: true, winner: 'draw', allPlayed: true }));
                return socket.emit('game-data', Object.assign(Object.assign({}, game), { clientId: currentUser === null || currentUser === void 0 ? void 0 : currentUser.id, hasMadeMove: true, gamePlayed: true, winner: 'draw', allPlayed: true }));
            }
            moves.forEach(move => {
                if (move[0] === (currentUser === null || currentUser === void 0 ? void 0 : currentUser.move) && move[1] === (opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.move)) {
                    setGameData(currentUser, opponentUser, game, gameId, users, currentUser.id);
                }
                if (move[0] === (opponentUser === null || opponentUser === void 0 ? void 0 : opponentUser.move) && move[1] === (currentUser === null || currentUser === void 0 ? void 0 : currentUser.move)) {
                    setGameData(currentUser, opponentUser, game, gameId, users, opponentUser.id);
                }
            });
        }
    }

    function setGameData(currentUser, opponentUser, game, gameId, users, winnerId) {
        const newUsers = users.map(user => {
            if (user.id === winnerId) {
                return Object.assign(Object.assign({}, user), { score: user.score += 1, winner: true });
            }
            return user;
        });
        let gameOver = false;
        if (newUsers[0].score === 3 || newUsers[1].score === 3) {
            gameOver = true;
        }
        const newGame = Object.assign(Object.assign({}, game), { winner: winnerId === currentUser.id ? 'you' : opponentUser.name, gameOver, users: newUsers });
        games.set(gameId, newGame);
        socket.to(opponentUser.id).emit('game-data', Object.assign(Object.assign({}, newGame), { allPlayed: true, clientId: opponentUser.id, gamePlayed: true, hasMadeMove: true }));
        socket.emit('game-data', Object.assign(Object.assign({}, newGame), { allPlayed: true, clientId: currentUser.id, gamePlayed: true, hasMadeMove: true }));
        if (gameOver)
            games.delete(gameId);
    }
});
server.listen(PORT, () => {
    console.log('server listening on port 8000');
});