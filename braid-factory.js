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
	var buf = new Buffer(value);
	return buf.toString('base64');
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

BraidFactory.prototype.newPresenceEntry = function(address, online, capabilities) {
	return {
		address : address,
		online : online,
		capabilities : capabilities
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

if (module) {
	module.exports = factory;
}
