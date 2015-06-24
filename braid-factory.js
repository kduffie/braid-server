if (typeof require !== 'undefined') {
	var BraidAddress = require('./braid-address').BraidAddress;
}

var messageId = Math.floor(Math.random() * 20) * 100 + 1;

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
	if (!to || to.length === 0) {
		to = [ requestMessage.from ];
	}
	var message = this.newMessage(to, requestMessage.id, from);
	message.type = "reply";
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
	if (!capabilities) {
		capabilities = {};
	}
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

BraidFactory.prototype.newHelloRequest = function(payload, from) {
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

BraidFactory.prototype.newTextMessage = function(textMessage, to, from) {
	var message = this.newCastMessage("im", to, from);
	message.data = {
		message : textMessage
	};
	return message;
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

BraidFactory.prototype.newFederateMessage = function(token, to, from) {
	var message = this.newRequest("federate", to, from);
	message.data = {
		token : token
	};
	return message;
};

BraidFactory.prototype.newCallbackRequest = function(token, to, from) {
	var message = this.newRequest("callback", to, from);
	message.data = {
		token : token
	};
	return message;
};

BraidFactory.prototype.newCloseRequest = function(to, from) {
	var message = this.newRequest("close", to, from);
	return message;
};

BraidFactory.prototype.newRosterEntry = function(targetAddress, resources) {
	if (!resources) {
		resources = [];
	}
	return {
		userId : targetAddress.userId,
		domain : targetAddress.domain,
		resources : resources
	};
};

BraidFactory.prototype.newRosterRequest = function(to, from) {
	var message = this.newRequest('roster', to, from);
	return message;
};

BraidFactory.prototype.newRosterReply = function(requestMessage, roster, from) {
	var message = this.newReply(requestMessage, from);
	message.data = roster;
	return message;
};

BraidFactory.prototype.newPingRequest = function(to, from) {
	var message = this.newRequest("ping", to, from);
	return message;
};

BraidFactory.prototype.newSubscribeMessage = function(to, from, resources) {
	var message = this.newCastMessage("subscribe", to, from);
	if (resources) {
		message.data = {
			resources : resources
		};
	}
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

BraidFactory.prototype.newTileAcceptRequest = function(to, from, tileId) {
	var message = this.newRequest("tile-accept", to, from);
	message.data = {
		tileId : tileId
	};
	return message;
};

BraidFactory.prototype.newTileAcceptReply = function(requestMessage, tileId, mutationCount, from, to) {
	var message = this.newReply(requestMessage, from, to);
	message.data = {
		tileId : tileId,
		mutationCount : mutationCount
	};
	return message;
};

BraidFactory.prototype.newTileMutationMessage = function(to, from, mutation) {
	var message = this.newCastMessage("tile-mutation", to, from);
	message.data = {
		tileId : mutation.tileId,
		mutationId : mutation.mutationId,
		created : mutation.created,
		originator : mutation.originator,
		action : mutation.action,
		value : mutation.value,
		fileId : mutation.fileId
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

BraidFactory.prototype.newTileMutationReply = function(requestMessage, to, from, tileId, mutationDescriptors) {
	var message = this.newReply(requestMessage, from, to);
	message.data = {
		tileId : tileId,
		descriptors : mutationDescriptors
	};
	return message;
};

BraidFactory.prototype.newTileInventoryRequest = function(to, from, summaries) {
	var message = this.newRequest("tile-inventory", to, from);
	message.data = {
		summaries : summaries
	};
	return message;
};

BraidFactory.prototype.newTileInventoryReply = function(requestMessage, from, mismatchedTileSummaries, missingTileInfos, upgradeAppDescriptors) {
	var message = this.newReply(requestMessage, from);
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

BraidFactory.prototype.newLatestMutationSummary = function(mutationId, created, originator) {
	return {
		mutationId : mutationId,
		created : created,
		originator : originator
	};
};

BraidFactory.prototype.newRemoteMutationSummary = function(available, match) {
	return {
		available : available,
		match : match
	};
};

BraidFactory.prototype.newTileSummary = function(tileId, appId, appVersion, mutationCount, stateHash, latestMutation, remoteMutation) {
	var result = {
		tileId : tileId,
		appId : appId,
		appVersion : appVersion,
		mutationCount : mutationCount,
		stateHash : stateHash
	};
	if (latestMutation) {
		result.latestMutation = latestMutation;
	}
	if (remoteMutation) {
		result.remoteMutation = remoteMutation;
	}
	return result;
};

BraidFactory.prototype.newTileSummaryFromTileRecord = function(record, remoteMutation) {
	var summary = this.newTileSummary(record.tileId, record.appId, record.version, 0, 0);
	if (record.summaryInfo) {
		summary.mutationCount = record.summaryInfo.mutationCount;
		summary.stateHash = record.summaryInfo.stateHash;
		if (record.summaryInfo.latestMutation) {
			summary.latestMutation = record.summaryInfo.latestMutation;
		}
	}
	if (remoteMutation) {
		summary.remoteMutation = remoteMutation;
	}
	return summary;
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

BraidFactory.prototype.newTileInfo = function(tileId, appId, version, pendingMutationCount, createdBy, created, members) {
	return {
		tileId : tileId,
		appId : appId,
		version : version,
		pendingMutationCount : pendingMutationCount,
		createdBy : createdBy,
		created : created,
		members : members
	};
};

BraidFactory.prototype.newTileMutation = function(tileId, mutationId, created, originator, action, value, fileId) {
	return {
		tileId : tileId,
		mutationId : mutationId,
		created : created,
		originator : originator,
		action : action,
		value : value,
		fileId : fileId
	};
};

BraidFactory.prototype.newTileMutationMemberValue = function(address) {
	return {
		member : address
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

BraidFactory.prototype.newTileMutationAddMember = function(mutation, address) {
	var bareAddress = new BraidAddress(address.userId, address.domain);
	mutation.action = 'member-add';
	mutation.value = this.newTileMutationMemberValue(bareAddress);
	return mutation;
};

BraidFactory.prototype.newTileMutationRemoveMember = function(mutation, memberBrid) {
	mutation.action = 'member-remove';
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

BraidFactory.prototype.newSubscriptionRecord = function(targetUserId, targetDomain, subscriberUserId, subscriberDomain) {
	return {
		target : {
			userId : targetUserId,
			domain : targetDomain
		},
		subscriber : {
			userId : subscriberUserId,
			domain : subscriberDomain
		}
	};
};

BraidFactory.prototype.newTileRecordFromInfo = function(tileInfo, summaryInfo) {
	return {
		tileId : tileInfo.tileId,
		appId : tileInfo.appId,
		version : tileInfo.version,
		pendingMutationCount : tileInfo.pendingMutationCount,
		createdBy : tileInfo.createdBy,
		created : tileInfo.created,
		members : [],
		summaryInfo : summaryInfo
	};
};

BraidFactory.prototype.newTileRecordSummaryInfo = function(mutationCount, stateHash, latestMutationId, latestMutationCreated, latestMutationOriginator) {
	return {
		mutationCount : mutationCount,
		stateHash : stateHash,
		latestMutation : {
			mutationId : latestMutationId,
			created : latestMutationCreated,
			originator : latestMutationOriginator
		}
	};
};

BraidFactory.prototype.newUserTileRecord = function(userId, tileId) {
	return {
		userId : userId,
		tileId : tileId
	};
};

BraidFactory.prototype.newMutationRecord = function(tileId, mutationId, created, originator, action, value, fileId, stateHash, previousValue, integrated, index) {
	return {
		tileId : tileId,
		mutationId : mutationId,
		created : created,
		originator : originator,
		action : action,
		value : value,
		fileId : fileId,
		stateHash : stateHash,
		previousValue : previousValue,
		integrated : integrated,
		index : index
	};
};

BraidFactory.prototype.newUnhandledMessageErrorReply = function(message, from) {
	return this.newErrorReply(message, 400, "Message type is unrecognized or unhandled", from);
};

var factory = new BraidFactory();

if (typeof module !== 'undefined') {
	module.exports = factory;
}
