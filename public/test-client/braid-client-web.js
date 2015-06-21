/*jshint eqeqeq: false*/

// braid-address
function BraidAddress(userId, domain, resource) {
	this.userId = userId;
	this.domain = domain;
	this.resource = resource;
}

BraidAddress.prototype.asString = function(omitResource) {
	var result = this.domain;
	if (this.user) {
		if (this.domain) {
			result = result + "/" + this.user;
		} else {
			result = this.user;
		}
	}
	if (this.resource && !omitResource) {
		result = result + ":" + this.resource;
	}
	return result;
};

BraidAddress.prototype.equals = function(address, ignoreResource) {
	return this.userId == address.userId && this.domain == address.domain && (!ignoreResource || this.resource == address.resource);
};

function newAddress(address) {
	return new BraidAddress(address.userId, address.domain, address.resource);
}

if (typeof module !== 'undefined') {
	module.exports = {
		BraidAddress : BraidAddress,
		newAddress : newAddress
	};
}

// braid-factory: Building braid objects

var messageId = 1;

function BraidFactory() {
}

BraidFactory.prototype.newMessage = function(to, id, from) {
	var mid;
	if (id) {
		mid = id;
	} else {
		mid = messageId++;
	}
	var message = {
		id : mid
	};
	if (to) {
		if (Array.isArray(to)) {
			message.to = to;
		} else {
			message.to = [ to ];
		}
	}
	if (from) {
		message.from = from;
	}
	return message;
};

BraidFactory.prototype.newRequest = function(requestType, to, from) {
	var message = this.newMessage(to, null, from);
	message.type = "request";
	message.request = requestType;
	return message;
};

BraidFactory.prototype.newReply = function(requestMessage, from, to) {
	if (!to) {
		to = [ requestMessage.from ];
	}
	var message = this.newMessage(to, requestMessage.id, from);
	message.type = "reply";
	message.code = 200;
	if (requestMessage.request) {
		message.request = requestMessage.request;
	}
	return message;
};

BraidFactory.prototype.newErrorReply = function(requestMessage, code, errorMessage, from) {
	var message = this.newMessage(requestMessage.from, requestMessage.id, from);
	message.type = "error";
	if (requestMessage.request) {
		message.request = requestMessage.request;
	}
	if (code) {
		message.code = code;
	}
	if (errorMessage) {
		message.message = errorMessage;
	}
	return message;
};

BraidFactory.prototype.newHelloPayload = function(product, version, capabilities) {
	return {
		product : product,
		version : version,
		capabilities : capabilities
	};
};

BraidFactory.prototype.newHelloReply = function(requestMessage, payload, from) {
	var message = this.newReply(requestMessage, from);
	message.data = payload;
	return message;
};

BraidFactory.prototype.newHelloRequest = function(requestMessage, payload, from) {
	var message = this.newRequest('hello', null, from);
	message.data = payload;
	return message;
};

BraidFactory.prototype.newCastMessage = function(requestType, to, from) {
	var message = this.newMessage(to, null, from);
	message.type = "cast";
	message.request = requestType;
	return message;
};

BraidFactory.prototype.newRegisterRequest = function(userId, password, to, from) {
	var message = this.newRequest("register", to, from);
	password = this.base64Encode(password);
	message.data = {
		user : userId,
		password : password
	};
	return message;
};

BraidFactory.prototype.base64Encode = function(value) {
	if (typeof Buffer === 'undefined') {
		return btoa(value);
	} else {
		var buf = new Buffer(value);
		return buf.toString('base64');
	}
};

BraidFactory.prototype.newAuthRequest = function(userId, password, to, from) {
	var message = this.newRequest("auth", to, from);
	password = this.base64Encode(password);
	message.data = {
		user : userId,
		password : password
	};
	return message;
};

BraidFactory.prototype.newRosterReply = function(requestMessage, roster) {
	var message = this.newReply(requestMessage);
	message.data = roster;
	return message;
};

BraidFactory.prototype.newPingRequest = function(to, from) {
	var message = this.newRequest("ping", to, from);
	return message;
};

BraidFactory.prototype.newRosterRequest = function() {
	var message = this.newRequest("roster");
	return message;
};

BraidFactory.prototype.newSubscribeMessage = function(to, from) {
	var message = this.newCastMessage("subscribe", to, from);
	return message;
};

BraidFactory.prototype.newUnsubscribeMessage = function(to, from) {
	var message = this.newCastMessage("unsubscribe", to, from);
	return message;
};

BraidFactory.prototype.newTileShareMessage = function(to, from, tileInfo) {
	var message = this.newCastMessage("tile-share", to, from);
	message.data = tileInfo;
	return message;
};

BraidFactory.prototype.newTileAcceptMessage = function(to, from, tileId) {
	var message = this.newCastMessage("tile-accept", to, from);
	message.data = {
		tileId : tileId
	};
	return message;
};

BraidFactory.prototype.newTileMutationMessage = function(to, from, mutationRecord) {
	var message = this.newCastMessage("tile-mutation", to, from);
	message.data = {
		tileId : mutationRecord.tileId,
		mutationId : mutationRecord.mutationId,
		created : mutationRecord.created,
		originator : mutationRecord.originator,
		action : mutationRecord.action,
		value : mutationRecord.value,
		fileId : mutationRecord.fileId
	};
	return message;
};

BraidFactory.prototype.newTileMutationResendRequest = function(to, from, tileId, mutationId, blobId) {
	var message = this.newRequest("tile-mutation-resend", to, from);
	message.data = {
		tileId : tileId,
		mutationId : mutationId,
		blobId : blobId
	};
	return message;
};

BraidFactory.prototype.newTileMutationListRequest = function(to, from, tileId, startingAfter, deliverFull, includeDependencies) {
	var message = this.newRequest("tile-mutation-list", to, from);
	message.data = {
		tileId : tileId,
		startingAfter : startingAfter,
		deliverFull : deliverFull,
		includeDependencies : includeDependencies
	};
	return message;
};

BraidFactory.prototype.newTileMutationListReply = function(requestMessage, to, from, tileId, mutationDescriptors) {
	var message = this.newReply(requestMessage, from, to);
	message.data = {
		tileId : tileId,
		descriptors : mutationDescriptors
	};
	return message;
};

BraidFactory.prototype.newTileInventoryListRequest = function(to, from, summaries) {
	var message = this.newRequest("tile-inventory", to, from);
	message.data = {
		summaries : summaries
	};
	return message;
};

BraidFactory.prototype.newTileInventoryListReply = function(requestMessage, to, from, mismatchedTileSummaries, missingTileInfos, upgradeAppDescriptors) {
	var message = this.newReply(requestMessage, from, to);
	message.data = {
		mismatchedTiles : mismatchedTileSummaries,
		missingTiles : missingTileInfos,
		upgradeAvailability : upgradeAppDescriptors
	};
	return message;
};

BraidFactory.prototype.newAppFetchRequest = function(to, from, appId, version, excludeFiles) {
	var message = this.newRequest("app-fetch", to, from);
	message.data = {
		appId : appId,
		version : version,
		files : excludeFiles
	};
	return message;
};

BraidFactory.prototype.newFileDescriptorMessage = function(to, from, fileId, contentType) {
	var message = this.newRequest("expect-blob", to, from);
	message.data = {
		fileId : fileId,
		contentType : contentType
	};
	return message;
};

BraidFactory.prototype.newAppFileDescriptorMessage = function(to, from, appId, version, filePath, contentType) {
	var message = this.newRequest("expect-app-file", to, from);
	message.data = {
		appId : appId,
		version : version,
		filePath : filePath,
		contentType : contentType
	};
	return message;
};

BraidFactory.prototype.newAppFetchReply = function(requestMessage, to, from, appId, version, files) {
	var message = this.newReply(requestMessage, "app-fetch", to, from);
	message.data = {
		appId : appId,
		version : version,
		files : files
	};
	return message;
};

BraidFactory.prototype.newTileSummary = function(tileId, appId, version, mutationCount, stateHash, latestMutationId, latestMutationCreated,
		latestMutationOriginator, remoteMutationAvailable, remoteMutationMatch) {
	return {
		tileId : tileId,
		appId : appId,
		version : version,
		mutationCount : mutationCount,
		stateHash : stateHash,
		latestMutation : {
			id : latestMutationId,
			created : latestMutationCreated,
			originator : latestMutationOriginator
		},
		remoteMutation : {
			available : remoteMutationAvailable,
			match : remoteMutationMatch
		}
	};
};

BraidFactory.prototype.newTileMutationDescriptor = function(id, stateHash) {
	return {
		id : id,
		stateHash : stateHash
	};
};

BraidFactory.prototype.newAppDescriptor = function(appId, version) {
	return {
		appId : appId,
		version : version
	};
};

BraidFactory.prototype.newTileInfo = function(tileId, appId, version, mutationCount, createdBy, created, members) {
	return {
		tileId : tileId,
		appId : appId,
		version : version,
		mutationCount : mutationCount,
		createdBy : createdBy,
		created : created,
		members : members
	};
};

BraidFactory.prototype.newTileMutation = function(tileId, mutationId, created, originator, action, value, fileId, previousValue) {
	return {
		tileId : tileId,
		mutationId : mutationId,
		created : created,
		originator : originator,
		action : action,
		value : value,
		fileId : fileId,
		previousValue : previousValue
	};
};

BraidFactory.prototype.newTileMutationMemberValue = function(memberBrid) {
	return {
		member : memberBrid
	};
};

BraidFactory.prototype.newTileMutationSetPropertyValue = function(name, type, value, updatedBy, updated) {
	return {
		name : name,
		type : type,
		value : value
	};
};

BraidFactory.prototype.newTileMutationDeletePropertyValue = function(name, type, value, updatedBy, updated) {
	return {
		name : name
	};
};

BraidFactory.prototype.newTileMutationAddMember = function(mutation, memberBrid) {
	mutation.action = 'add-member';
	mutation.value = this.newTileMutationMemberValue(memberBrid);
	return mutation;
};

BraidFactory.prototype.newTileMutationRemoveMember = function(mutation, memberBrid) {
	mutation.action = 'remove-member';
	mutation.value = this.newTileMutationMemberValue(memberBrid);
	return mutation;
};

// type: { 'string', 'boolean', 'int', 'float' }
BraidFactory.prototype.newTileMutationSetProperty = function(mutation, propertyName, type, value) {
	mutation.action = 'property-set';
	mutation.value = {
		name : propertyName,
		type : type,
		value : value
	};
	return mutation;
};

BraidFactory.prototype.newPropertyRecord = function(tileId, name, type, value, updatedBy, updated) {
	return {
		tileId : tileId,
		name : name,
		type : type,
		value : value,
		updatedBy : updatedBy,
		updated : updated
	};
};

BraidFactory.prototype.newTileMutationSetRecordValue = function(collection, recordId, sort, value, fileId, updatedBy, updated) {
	return {
		collection : collection,
		recordId : recordId,
		sort : sort,
		value : value,
		fileId : fileId
	};
};

BraidFactory.prototype.newTileMutationSetRecordPositionValue = function(collection, recordId, sort) {
	return {
		collection : collection,
		recordId : recordId,
		sort : sort
	};
};

BraidFactory.prototype.newTileMutationDeleteRecordValue = function(record) {
	return {
		collection : record.collection,
		recordId : record.recordId
	};
};

BraidFactory.prototype.newCollectionRecord = function(tileId, collection, recordId, sort, value, fileId, updatedBy, updated) {
	return {
		tileId : tileId,
		collection : collection,
		recordId : recordId,
		sort : sort,
		value : value,
		fileId : fileId,
		updatedBy : updatedBy,
		updated : updated
	};
};

BraidFactory.prototype.newTileMutationMemberValue = function(member) {
	return {
		member : member
	};
};

BraidFactory.prototype.newTileMutationSetFileValue = function(fileName, fileId) {
	return {
		fileName : fileName,
		fileId : fileId
	};
};

BraidFactory.prototype.newTileMutationDeleteFileValue = function(fileName) {
	return {
		fileName : fileName
	};
};

BraidFactory.prototype.newFileRecord = function(tileId, fileName, fileId) {
	return {
		tileId : tileId,
		fileName : fileName,
		fileId : fileId
	};
};

BraidFactory.prototype.newPresenceEntry = function(address, online) {
	return {
		address : address,
		online : online
	};
};

BraidFactory.prototype.newPresenceMessage = function(presence, to, from) {
	var message = this.newCastMessage("presence", to, from);
	message.data = presence;
	return message;
};

BraidFactory.prototype.newAccountRecord = function(userId, domain, passwordHash) {
	return {
		userId : userId,
		domain : domain,
		password : passwordHash
	};
};

BraidFactory.prototype.newSubscriptionRecord = function(bareBrid) {
	return {
		brid : bareBrid,
		subscribers : []
	};
};

BraidFactory.prototype.newTileRecordFromInfo = function(tileInfo) {
	return {
		tileId : tileInfo.tileId,
		appId : tileInfo.appId,
		version : tileInfo.version,
		mutationCount : tileInfo.mutationCount,
		createdBy : tileInfo.createdBy,
		created : tileInfo.created,
		members : []
	};
};

BraidFactory.prototype.newUserTileRecord = function(userId, tileId) {
	return {
		userId : userId,
		tileId : tileId
	};
};

BraidFactory.prototype.newMutationRecord = function(tileId, mutationId, created, originator, action, value, fileId, previousValue, integrated) {
	return {
		tileId : tileId,
		mutationId : mutationId,
		created : created,
		originator : originator,
		action : action,
		value : value,
		fileId : fileId,
		previousValue : previousValue,
		integrated : integrated
	};
};

BraidFactory.prototype.newUnhandledMessageErrorReply = function(message, from) {
	return this.newErrorReply(message, 400, "Message type is unrecognized or unhandled", from);
};

var factory = new BraidFactory();

if (typeof module !== 'undefined') {
	module.exports = factory;
}

// braid-client: Managing a braid client session

function BraidClient(domain, port) {
	this.domain = domain;
	this.port = port;
	this.pendingRequests = {};
	this.roster = {};
	this.state = 'pending';
}

BraidClient.prototype.connect = function(callback) {
	console.log(this.userId + ": connect");
	this.connectCallback = callback;
	this.socket = new WebSocket("ws://" + this.domain + ":" + this.port + "/braid-client", []);
	this.socket.onopen = this.onSocketOpen.bind(this);
	this.socket.onerror = this.onSocketError.bind(this);
	this.socket.onmessage = this.onSocketMessage.bind(this);
	this.socket.onclose = this.onSocketClosed.bind(this);
};

BraidClient.prototype.sendHello = function(payload, callback) {
	var hello = factory.newHelloRequest(payload, this.address);
	this.sendRequest(hello, callback);
};

BraidClient.prototype.register = function(userId, password, callback) {
	this.userId = userId;
	console.log(this.userId + ": register", userId);
	var request = factory.newRegisterRequest(userId, password);
	this.sendRequest(request, function(err, reply) {
		if (err) {
			if (callback) {
				callback(err);
			}
		} else {
			if (reply.type === 'reply') {
				if (Array.isArray(reply.to)) {
					if (reply.to.length > 0) {
						this.address = reply.to[0];
					}
				} else {
					this.address = reply.to;
				}
				this.state = 'active';
				if (callback) {
					callback(null, reply);
				}
			} else {
				callback(this.getErrorDisplay(reply));
			}
		}
	}.bind(this));
};

BraidClient.prototype.getErrorDisplay = function(reply) {
	var message;
	if (reply.message) {
		message = reply.message;
	} else if (reply.code) {
		message = "Error " + reply.code;
	} else {
		message = "Failure";
	}
	return message;
};

BraidClient.prototype.authenticate = function(userId, password, callback) {
	this.userId = userId;
	console.log(this.userId + ": authenticate", userId);
	var request = factory.newAuthRequest(userId, password);
	this.sendRequest(request, function(err, reply) {
		if (err) {
			if (callback) {
				callback(err);
			}
		} else {
			if (reply.type === 'reply') {
				if (Array.isArray(reply.to)) {
					if (reply.to.length > 0) {
						this.address = reply.to[0];
					}
				} else {
					this.address = reply.to;
				}
				if (reply.data) {
					this.roster = reply.data;
				}
				this.state = 'active';
				if (callback) {
					callback(null, reply);
				}
			} else {
				callback(this.getErrorDisplay(reply));
			}
		}
	}.bind(this));
};

BraidClient.prototype.pingServer = function(callback) {
	console.log(this.userId + ": pingServer");
	this.pingEndpoint(null, callback);
};

BraidClient.prototype.parseAddressEntry = function(value) {
	if (value.indexOf("@") >= 0) {
		var parts = value.split("@");
		return new BraidAddress(parts[0], parts[1]);
	} else {
		return new BraidAddress(value, this.address.domain);
	}
}

BraidClient.prototype.pingEndpoint = function(user, callback) {
	console.log(this.userId + ": pingEndpoint", user);
	var to = this.parseAddressEntry(user);
	var request = factory.newPingRequest(to);
	this.sendRequest(request, function(err, reply) {
		if (err) {
			if (callback) {
				callback(err);
			}
		} else {
			if (callback) {
				callback(null, reply);
			}
		}
	}.bind(this));
};

BraidClient.prototype.requestRoster = function(callback) {
	console.log(this.userId + ": requestRoster");
	var cast = factory.newRosterRequest();
	this.sendRequest(cast, callback);
};

BraidClient.prototype.subscribe = function(userId) {
	console.log(this.userId + ": subscribe", userId);
	var to = this.parseAddressEntry(user);
	var cast = factory.newSubscribeMessage(to);
	this.sendCast(cast);
};

BraidClient.prototype.unsubscribe = function(userId) {
	console.log(this.userId + ": unsubscribe", userId);
	var to = this.parseAddressEntry(user);
	var cast = factory.newUnsubscribeMessage(to);
	this.sendCast(cast);
};

BraidClient.prototype.onSocketOpen = function(event) {
	console.log(this.userId + ": onSocketOpen");
	if (this.connectCallback) {
		this.connectCallback();
	}
};

BraidClient.prototype.onSocketError = function(event) {
	console.log(this.userId + ": onSocketError", event);
};

BraidClient.prototype.dumpRoster = function(event) {
	console.log(this.userId + ": current roster", this.roster);
};

BraidClient.prototype.onSocketMessage = function(event) {
	var messageString = event.data;
	var message;
	try {
		message = JSON.parse(messageString);
	} catch (err) {
		console.log("Invalid message received", messageString, err);
		return;
	}
	console.log(this.userId + " RX", message);
	if (message.id && (message.type === 'reply' || message.type === 'error')) {
		var pendingCallback = this.pendingRequests[message.id];
		if (pendingCallback) {
			delete this.pendingRequests[message.id];
			pendingCallback(null, message);
		} else {
			console.log("Received reply or error for request with no pending callback", message);
		}
	} else if (message.type === 'cast') {
		switch (message.request) {
		case 'subscribe':
			this.handleSubscribe(message);
			break;
		case 'unsubscribe':
			this.handleUnsubscribe(message);
			break;
		case 'presence':
			this.handlePresence(message);
			break;
		default:
			console.log("Unhandled cast received", message);
			break;
		}
	} else if (message.type === 'request') {
		switch (message.request) {
		case 'ping':
			this.handlePingRequest(message);
			break;
		default:
			console.log("Unhandled request received", message);
			break;
		}
	} else {
		console.log("Unhandled message received", message);
	}
};

BraidClient.prototype.handleSubscribe = function(message) {
	if (message.from && message.data && message.data.resources) {
		var from = newAddress(message.from);
		this.roster[from.asString(true)] = message.data.resources;
	}
	// todo: callback to outside code
};

BraidClient.prototype.handleUnsubscribe = function(message) {
	if (message.from) {
		var from = newAddress(message.from);
		delete this.roster[from.asString(true)];
	}
	// todo: callback to outside code
};

BraidClient.prototype.handlePresence = function(message) {
	if (message.data && message.data.address) {
		var address = newAddress(message.data.address);
		var rosterItem = this.roster[address.asString(true)];
		if (rosterItem) {
			if (message.data.online) {
				rosterItem.push(address.resource);
			} else {
				var index = rosterItem.indexOf(address.resource);
				if (index >= 0) {
					rosterItem.splice(index, 1);
				}
			}
		} else {
			if (message.data.online) {
				rosterItem = [ address.resource ];
				this.roster[address.asString(true)] = rosterItem;
			}
		}
		// if (message.data.online) {
		// // todo: callback to caller
		// } else {
		// // todo: callback to caller
		// }
	} else {
		console.log(this.userId + ": Invalid braid presence message", message);
	}
};
BraidClient.prototype.handlePingRequest = function(message) {
	var reply = factory.newReply(message, this.address, message.from);
	this.sendReply(reply);
};

BraidClient.prototype.onSocketBinary = function() {
};

BraidClient.prototype.onSocketClosed = function() {
	console.log(this.userId + ": Braid socket closed");
	this.finalize();
};

BraidClient.prototype.close = function() {
	console.log(this.userId + ": Braid socket closing");
	if (this.socket) {
		this.socket.close();
	}
	this.finalize();
};

BraidClient.prototype.finalize = function() {
};

BraidClient.prototype.sendRequest = function(requestMessage, callback) {
	var id = requestMessage.id;
	this.pendingRequests[id] = callback;
	setTimeout(function() {
		var cb = this.pendingRequests[id];
		if (cb) {
			cb(this.userId + ": Request timeout");
		}
	}.bind(this), 30000);
	console.log(this.userId + ": REQUEST", requestMessage);
	this.socket.send(JSON.stringify(requestMessage));
};

BraidClient.prototype.sendCast = function(castMessage) {
	console.log(this.userId + ": CAST", castMessage);
	this.socket.send(JSON.stringify(castMessage));
};

BraidClient.prototype.sendReply = function(replyMessage) {
	console.log(this.userId + ": REPLY", replyMessage);
	this.socket.send(JSON.stringify(replyMessage));
};

if (typeof module !== 'undefined') {
	module.exports = {
		BraidClient : BraidClient
	};
}
