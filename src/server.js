const fs = require('fs');
const https = require('https');
const express = require('express');
const socketIO = require('socket.io');
const debug = require('debug')('barrio:app');

const app = express();
const server = https.createServer({
	key: fs.readFileSync('./cert/server-key.pem'),
	cert: fs.readFileSync('./cert/server-cert.crt')
}, app);
const io = socketIO(server);

const PORT = process.env.PORT || 8080;

const events = {
	client: {
		READY: 'client::ready',
		CALL_BUDDY: 'client::call-buddy',
		ACCEPT_CALL: 'client::accept-call'
	},
	server: {
		CLIENT_ID_GENERATED: 'server::client-id-generated',
		BUDDIES_LIST: 'server::buddies-list',
		NEW_BUDDY: 'server::new-buddy',
		BUDDY_DISCONNECTED: 'server::buddy-disconnected',
		BUDDY_CALLING: 'server::buddy-calling',
		CALL_ACCEPTED: 'server::call-accepted'
	}
};

const connectedUsers = {};

io.on('connection', socket => {

	// Store this user connection ID
	if (!connectedUsers[socket.id]) {
		connectedUsers[socket.id] = { id: socket.id };
	}

	// Tell the connected user which is his ID
	debug('Tell the user his ID');
	socket.emit(events.server.CLIENT_ID_GENERATED, { id: socket.id });

	debug('Send buddies list to this user')
	socket.emit(events.server.BUDDIES_LIST, { 
		buddies: Object.keys(connectedUsers)
			.filter(userId => userId !== socket.id)
			.map(userId => connectedUsers[userId])
	});

	// The user tells his nickname
	socket.on(events.client.READY, data => {
		debug('User send his data:', data)
		const userData = { 
			...connectedUsers[socket.id],
			nickname: data.nickname,
			signal: data.signal
		};
		connectedUsers[socket.id] = userData;

		// Tell everyone that this user is now available
		debug('Tell the others that this user is now available');
		socket.broadcast.emit(events.server.NEW_BUDDY, { buddy: userData });
	});

	// This user wants to call another one
	// socket.on('call-user', data => {
	// 	io.to(data.userToCall).emit('start-stream', { signal: data.signalData, from: data.from });
	// });
	/*
		{ caller, callerSignal, buddyId }
	*/
	socket.on(events.client.CALL_BUDDY, ({ caller, callerSignal, buddyId }) => {
		io.to(buddyId).emit(events.server.BUDDY_CALLING, {
			buddy: caller,
			buddySignal: callerSignal
		});
	});

	/*
		{ callee, calleeSignal }
	*/
	socket.on(events.client.ACCEPT_CALL, ({ callee, buddy, calleeSignal }) => {
		io.to(buddy.id).emit(events.server.CALL_ACCEPTED, { 
			buddy: callee, 
			buddySignal: calleeSignal
		});
	});

	// // This user wants to accept an incoming call
	// socket.on('accept-call', data => {
	// 	io.to(data.to).emit('accept-stream', data.signal);
	// });

	// The user has left the room
	socket.on('disconnect', () => {
		debug('User has disconnected:', socket.id);
		// Tell the others this one is no more in the room
		io.sockets.emit(events.server.BUDDY_DISCONNECTED, { buddy: connectedUsers[socket.id] });

		// Remove him from the list of connected users
		delete connectedUsers[socket.id];
	});

});

server.listen(PORT, () => debug(`Server up and running on port ${PORT}`));
