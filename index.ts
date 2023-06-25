import http from 'http'
import express from 'express'
import {Server} from 'socket.io'
import { v4 as uuid } from 'uuid'

type gameType = {
    users: {id:string,name:string,move:string}[]|[]
}
type userType = {
     id: string ,move: string,score: number,winner:boolean,name:string
}

const app = express()
const server = http.createServer(app)

const io = new Server(server, { cors: { origin: '*' } })

const userNames = new Set()
const games=new Map()
const moves = [
    ['paper', 'rock'],
    ['scissors', 'paper'],
    ['rock', 'scissors'],
]




io.on('connection', (socket:any) => {
    console.log('connected')
    socket.on('join-game',  (username:string )=> {

        if (!username) {
            const errorMessage = 'username is required'
            return socket.emit('username-error', errorMessage)
        }

     const currentUsername= socket.data?.user?.username
        if (userNames.has(username)&& username!==currentUsername) {
            const errorMessage = 'username already taken'
            return socket.emit('username-error', errorMessage)
        }

        const user = {username, gameId:''}
        socket.data.user = user

        userNames.add(username)

        socket.emit('username-error', '')
        socket.emit('searching-status', 'searching')
        
        let hasAvailableGame = false
        let currentGame:gameType={users:[]}

        games.forEach((game, gameId) => {
            if (game.users.length === 1) {
               socket.data.user = { ...socket.data.user, gameId } 
               hasAvailableGame = true
               currentGame  ={...game, users: [...game.users, { id: socket.id, name: socket.data.user.username,score:0,move:'' }] }
               games.set(gameId,currentGame)
            }
        })

        if (hasAvailableGame ) {
            const [opponent,you] = currentGame.users
            
            socket.to(opponent.id).emit('game-data', { ...currentGame, clientId: opponent.id })
            socket.to((opponent.id)).emit('searching-status', 'found')
        
            socket.emit('game-data', {...currentGame, clientId: you.id })
            return socket.emit('searching-status', 'found')
        }

        const gameId= uuid()
        socket.data.user = { ...socket.data.user, gameId }
        
        const game = {allPlayed:false,gameOver:false,adminId:socket.id,users: [{ id: socket.id, name: socket.data.user.username,score:0,move:'',winner:false }] }
        games.set(gameId, game)
       
    })

    socket.on('play-move', (move:string) => {
        if (move) {
            const userId = socket.id
            const gameId = socket.data?.user?.gameId
            const game = games.get(gameId);

           if(!game)return

            const { users }: { users: { id: string, move: string }[] } = game
        
    
            users.forEach(user => {
                if (user.id !== userId) socket.to(user.id).emit('game-data', {...game, hasMadeMove: true,clientId:socket.id })
            })
      
        
            const newUsers = users.map(user => {
                if (user.id === userId) return { ...user, move };
                return user
            })
            games.set(gameId, {...game, users: newUsers })
        
            play(gameId, userId)
      
        
        
        } 
    })

    socket.on('new-round', () => {

        const gameId = socket.data?.user?.gameId
        const userId = socket.id
        const game = games.get(gameId);

        if(!game)return
        const { users }: { users: userType[] } = game
        const opponentUser = users.find(user => user.id !== userId)
        
        const resetUsers = users.map(user => {
            return {...user,winner:false,move:''}
        })
        const resetGame = { ...game,allPlayed:false, gamePlayed: false, winner: '',users:resetUsers,hasMadeMove: false }
        games.set(gameId, resetGame)
        console.log(resetGame)
        socket.to(opponentUser?.id).emit('game-data', {...resetGame ,clientId:opponentUser?.id })
        socket.emit('game-data', {...resetGame,clientId:userId })
    })

   socket.on("disconnect", () => {

    const userId=socket.id
       const gameId = socket.data?.user?.gameId
         const  username = socket.data?.user?.username

       if (!username || !gameId) return
       
       const game = games.get(gameId)
       if(!game)return

    const users:userType[] =game.users

    if (users.length > 1) {
        const currentUser =users.find(user => user.id === userId)
        const opponentUser = users.find(user => user.id !== userId)
        socket.to(opponentUser?.id).emit('opponent-disconnected',`${currentUser?.name} has left the game`)
    }
       games.delete(gameId)
       userNames.delete(username)
});


    function play(gameId:string,userId:string) {
        const game = games.get(gameId);
         const { users }: { users: userType[] } = game
         const allPayed = users.every((user => user.move))
console.log(users)
        if (allPayed) {
            const currentUser =users.find(user => user.id === userId)
            const opponentUser = users.find(user => user.id !== userId)
            
            if (currentUser?.move === opponentUser?.move) {
                socket.to(opponentUser?.id).emit('game-data',{...game,clientId:opponentUser?.id,hasMadeMove: true,gamePlayed:true,winner:'draw',allPlayed:true,})
                return socket.emit('game-data',{...game,clientId:currentUser?.id,hasMadeMove: true,gamePlayed:true,winner:'draw',allPlayed:true,})
            }

            moves.forEach(move => {
             
                if (move[0] === currentUser?.move && move[1] ===opponentUser?.move) {
                    setGameData(currentUser,opponentUser,game,gameId,users,currentUser.id)
                }
                if (move[0] === opponentUser?.move && move[1] === currentUser?.move) {
                    setGameData(currentUser,opponentUser,game,gameId,users,opponentUser.id)
                }
                
            })
        }
    }
    function setGameData(currentUser: userType, opponentUser: userType, game: object, gameId: string, users: userType[], winnerId: string) {

        const newUsers = users.map(user => {
            if (user.id === winnerId) {
                return { ...user, score: user.score += 1, winner: true }
            }
            return user
        })

        let gameOver=false
        if (newUsers[0].score === 3||newUsers[1].score === 3) {
            gameOver=true
        }
                     const newGame= {...game,winner:winnerId===currentUser.id?'you': opponentUser.name,gameOver, users:newUsers}
        games.set(gameId, newGame)

        socket.to(opponentUser.id).emit('game-data', { ...newGame,allPlayed:true, clientId: opponentUser.id,gamePlayed:true,hasMadeMove: true })
        socket.emit('game-data',{...newGame,allPlayed:true,clientId:currentUser.id,gamePlayed:true,hasMadeMove: true} )
    
    if(gameOver) games.delete(gameId)
    
    }
})








server.listen(8000, () => {
    console.log('server listening on port 8000')
})