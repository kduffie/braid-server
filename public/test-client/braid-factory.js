if (typeof require !== 'undefined') {
	var BraidAddress = require('./braid-address').BraidAddress;
	var newUuid = require('./braid-uuid');
}

var messageId = Math.floor(Math.random() * 20) * 100 + 1;

function BraidFactory() {
}

BraidFactory.prototype.newBareAddress = function(userid, domain) {
	var result = {
		domain : domain
	};
	if (userid) {
		result.userid = userid;
	}
	return result;
};

BraidFactory.prototype.newAddress = function(userid, domain, resource) {
	var result = this.newBareAddress(userid, domain);
	if (resource) {
		result.resource = resource;
	}
	return result;
};

// Messages

BraidFactory.prototype.newMessage = function(id, type, request, from, to, code, message, data) {
	var result = {
		id : id,
		type : type,
		request : request
	};
	if (from) {
		result.from = from;
	}
	if (to) {
		if (Array.isArray(to)) {
			result.to = to;
		} else {
			result.to = [ to ];
		}
	}
	if (code) {
		result.code = code;
	}
	if (message) {
		result.message = message;
	}
	if (data) {
		result.data = data;
	}
	return result;
};

BraidFactory.prototype.newCastMessage = function(request, from, to, data) {
	return this.newMessage(messageId++, "cast", request, from, to, null, null, data);
};

BraidFactory.prototype.newRequestMessage = function(request, from, to, data) {
	return this.newMessage(messageId++, "request", request, from, to, null, null, data);
};

BraidFactory.prototype.newReplyMessage = function(requestMessage, from, data, to) {
	var toField = requestMessage.from;
	if (to) {
		toField = to;
	}
	return this.newMessage(requestMessage.id, "reply", requestMessage.request, from, toField, null, null, data);
};

BraidFactory.prototype.newErrorReplyMessage = function(requestMessage, from, code, message) {
	return this.newMessage(requestMessage.id, "error", requestMessage.request, from, requestMessage.from, code, message, null);
};

BraidFactory.prototype.newUnhandledMessageErrorReply = function(requestMessage, from) {
	return this.newErrorMessage(requestMessage, from, 400, "Message type is unrecognized or unhandled");
};

// All various braid message objects

BraidFactory.prototype.newAuthRequestMessage = function(user, password, to, from) {
	return this.newRequestMessage("auth", from, to, this.newCredentialMessageData(user, password));
};

BraidFactory.prototype.newAuthReplyMessage = function(requestMessage, from, to) {
	return this.newReplyMessage(requestMessage, from, null, to);
};

BraidFactory.prototype.newRegisterRequestMessage = function(user, password, to, from) {
	return this.newRequestMessage("register", from, to, this.newCredentialMessageData(user, password));
};

BraidFactory.prototype.newRegisterReplyMessage = function(requestMessage, from, to) {
	return this.newReplyMessage(requestMessage, from, null, to);
};

BraidFactory.prototype.newHelloRequestMessage = function(from, to, product, version, capabilities) {
	return this.newRequestMessage("hello", from, to, this.newHelloMessageData(product, version, capabilities));
};

BraidFactory.prototype.newHelloReplyMessage = function(requestMessage, from, product, version, capabilities) {
	return this.newReplyMessage(requestMessage, from, this.newHelloMessageData(product, version, capabilities));
};

BraidFactory.prototype.newIMMessage = function(from, to, text) {
	return this.newCastMessage("im", from, to, this.newIMMessageData(text));
};

BraidFactory.prototype.newPresenceMessage = function(from, to, presenceData) {
	return this.newCastMessage("presence", from, to, presenceData);
};

BraidFactory.prototype.newRosterRequestMessage = function(from, to) {
	return this.newRequestMessage("roster", from, to, null);
};

BraidFactory.prototype.newRosterReplyMessage = function(requestMessage, from, entries) {
	return this.newReplyMessage(requestMessage, from, this.newRosterMessageData(entries));
};

BraidFactory.prototype.newPingRequestMessage = function(from, to) {
	return this.newRequestMessage("ping", from, to, null);
};

BraidFactory.prototype.newPingReplyMessage = function(requestMessage, from) {
	return this.newReplyMessage(requestMessage, from, null);
};

BraidFactory.prototype.newSubscribeMessage = function(from, to, resources) {
	return this.newCastMessage("subscribe", from, to, this.newSubscribeMessageData(resources));
};

BraidFactory.prototype.newUnsubscribeMessage = function(from, to, resources) {
	return this.newCastMessage("unsubscribe", from, to, null);
};

BraidFactory.prototype.newSynchronizeRequestMessage = function(from, to, summaries) {
	return this.newRequestMessage("synchronize", from, to, this.newSynchronizeRequestMessageData(summaries));
};

BraidFactory.prototype.newSynchronizeReplyMessage = function(requestMessage, from, missing, mismatches) {
	return this.newReplyMessage(requestMessage, from, this.newSynchronizeReplyMessageData(missing, mismatches));
};

BraidFactory.prototype.newMutationMessage = function(from, to, mutation) {
	return this.newCastMessage("mutation", from, to, mutation);
};

BraidFactory.prototype.newMutationListRequestMessage = function(from, to, objectType, objectId, startingAfter, deliverFull) {
	return this.newRequestMessage("mutation-list", from, to, this.newMutationListRequestMessageData(objectType, objectId, startingAfter, deliverFull));
};

BraidFactory.prototype.newMutationListReplyMessage = function(requestMessage, from, objectType, objectId, descriptors) {
	return this.newReplyMessage(requestMessage, from, this.newMutationListReplyMessageData(objectType, objectId, descriptors));
};

BraidFactory.prototype.newFederateRequestMessage = function(from, to, token) {
	return this.newRequestMessage("federate", from, to, this.newFederateMessageData(token));
};

BraidFactory.prototype.newFederateReplyMessage = function(requestMessage, from) {
	return this.newReplyMessage(requestMessage, from, null);
};

BraidFactory.prototype.newCallbackRequestMessage = function(from, to, token) {
	return this.newRequestMessage("callback", from, to, this.newCallbackMessageData(token));
};

BraidFactory.prototype.newCallbackReplyMessage = function(requestMessage, from) {
	return this.newReplyMessage(requestMessage, from, null);
};

BraidFactory.prototype.newCloseRequestMessage = function(from, to) {
	return this.newRequestMessage("close", to, from, null);
};

BraidFactory.prototype.newCloseReplyMessage = function(requestMessage, from) {
	return this.newReplyMessage(requestMessage, from, null);
};

// Data objects used in the 'data' member of messages

BraidFactory.prototype.newCredentialMessageData = function(user, password) {
	return {
		user : user,
		password : this.base64Encode(password)
	};
};

BraidFactory.prototype.newHelloMessageData = function(product, version, capabilities) {
	var result = {
		product : product,
		version : version
	};
	if (capabilities) {
		result.capabilities = capabilities;
	}
	return result;
};

BraidFactory.prototype.newIMMessageData = function(text) {
	return {
		message : text
	};
};

BraidFactory.prototype.newPresenceMessageData = function(address, online) {
	return {
		address : address,
		online : online
	};
};

BraidFactory.prototype.newRosterEntry = function(targetAddress, resources) {
	if (!resources) {
		resources = [];
	}
	return {
		userid : targetAddress.userid,
		domain : targetAddress.domain,
		resources : resources
	};
};

BraidFactory.prototype.newRosterMessageData = function(entries) {
	return {
		entries : entries
	}
};

BraidFactory.prototype.newSubscribeMessageData = function(resources) {
	return {
		resources : resources
	}
};

BraidFactory.prototype.newSharedObjectSummary = function(objectType, objectId, appId, appVersion, mutationCount, stateHash, latestMutationId, remoteAvailable,
		remoteMatch) {
	var result = {
		objectType : objectType,
		objectId : objectId,
		mutationCount : mutationCount,
		stateHash : stateHash
	};
	if (appId) {
		result.appId = appId;
	}
	if (appVersion) {
		result.appVersion = appVersion;
	}
	if (latestMutationId) {
		result.latestMutationId = latestMutationId;
	}
	if (remoteAvailable) {
		result.remoteAvailable = remoteAvailable;
	}
	if (remoteMatch) {
		result.remoteMatch = remoteMatch;
	}
	return result;
};

BraidFactory.prototype.newSynchronizeRequestMessageData = function(summaries) {
	return {
		summaries : summaries
	}
};

BraidFactory.prototype.newSynchronizeReplyMessageData = function(missing, mismatches) {
	return {
		missing : missing,
		mismatches : mismatches
	}
};

BraidFactory.prototype.newFileDescriptor = function(domain, fileId, key) {
	return {
		domain : domain,
		fileId : fileId,
		key : key
	}
};

BraidFactory.prototype.newMutation = function(objectType, objectId, mutationId, created, originator, action, value) {
	var result = {
		objectType : objectType,
		objectId : objectId,
		mutationId : mutationId,
		created : created,
		action : action
	};
	if (originator) {
		result.originator = originator;
	}
	if (value) {
		result.value = value;
	}
	return result;
};

BraidFactory.prototype.newMutationListRequestMessageData = function(objectType, objectId, startingAfter, deliverFull) {
	return {
		objectType : objectType,
		objectId : objectId,
		startingAfter : startingAfter,
		deliverFull : deliverFull
	};
};

BraidFactory.prototype.newMutationDescriptor = function(id, stateHash, resent) {
	var result = {
		id : id,
		stateHash : stateHash
	};
	if (resent) {
		result.resent = true;
	}
	return result;
};

BraidFactory.prototype.newMutationListReplyMessageData = function(objectType, objectId, descriptors) {
	return {
		objectType : objectType,
		objectId : objectId,
		descriptors : descriptors
	};
};

BraidFactory.prototype.newFederateMessageData = function(token) {
	return {
		token : token
	}
};

BraidFactory.prototype.newCallbackMessageData = function(token) {
	return {
		token : token
	}
};

// Mutations

BraidFactory.prototype.newAddMemberMutation = function(objectType, objectId, originator, member) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "member-add", this.newMemberMutationValue(member));
};

BraidFactory.prototype.newRemoveMemberMutation = function(objectType, objectId, originator, member) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "member-remove", this.newMemberMutationValue(member));
};

BraidFactory.prototype.newSetPropertyMutation = function(objectType, objectId, originator, name, type, value) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "property-set", this.newSetPropertyMutationValue(name, type, value));
};

BraidFactory.prototype.newDeletePropertyMutation = function(objectType, objectId, originator, name) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "property-set", this.newDeletePropertyMutationValue(name));
};

BraidFactory.prototype.newSetRecordMutation = function(objectType, objectId, originator, collection, recordId, sort, value, file) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "record-set", this.newSetRecordMutationValue(collection, recordId,
			sort, value, file));
};

BraidFactory.prototype.newReorderRecordMutation = function(objectType, objectId, originator, collection, recordId, sort) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "record-reorder", this.newReorderRecordMutationValue(collection,
			recordId, sort));
};

BraidFactory.prototype.newDeleteRecordMutation = function(objectType, objectId, originator, collection, recordId) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "record-delete", this.newDeleteRecordMutationValue(collection,
			recordId));
};

BraidFactory.prototype.newSetFileMutation = function(objectType, objectId, originator, fileName, file) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "file-set", this.newSetFileMutationValue(fileName, file));
};

BraidFactory.prototype.newDeleteFileMutation = function(objectType, objectId, originator, fileName) {
	return this.newMutation(objectType, objectId, newUuid(), DateTime.now(), originator, "file-delete", this.newDeleteFileMutationValue(fileName, file));
};

// Mutation Values

BraidFactory.prototype.newMemberMutationValue = function(member) {
	return {
		member : member
	}
};

BraidFactory.prototype.newSetPropertyMutationValue = function(name, type, value) {
	return {
		name : name,
		type : type,
		value : value
	}
};

BraidFactory.prototype.newDeletePropertyMutationValue = function(name) {
	return {
		name : name
	}
};

BraidFactory.prototype.newSetRecordMutationValue = function(collection, recordId, sort, value, file) {
	var result = {
		collection : collection,
		recordId : recordId,
		sort : sort
	};
	if (value) {
		result.value = value;
	}
	if (file) {
		result.file = file;
	}
	return result;
};

BraidFactory.prototype.newDeleteRecordMutationValue = function(collection, recordId) {
	return {
		collection : collection,
		recordId : recordId
	}
};

BraidFactory.prototype.newReorderRecordMutationValue = function(collection, recordId, sort) {
	return {
		collection : collection,
		recordId : recordId,
		sort : sort
	}
};

BraidFactory.prototype.newSetFileMutationValue = function(fileName, file) {
	return {
		fileName : fileName,
		file : file
	}
};

BraidFactory.prototype.newDeleteFileMutationValue = function(fileName) {
	return {
		fileName : fileName
	}
};

// Utils

BraidFactory.prototype.base64Encode = function(value) {
	if (typeof Buffer === 'undefined') {
		return btoa(value);
	} else {
		var buf = new Buffer(value);
		return buf.toString('base64');
	}
};

// Database records

BraidFactory.prototype.newAccountRecord = function(userid, domain, passwordHash) {
	return {
		userid : userid,
		domain : domain,
		password : passwordHash
	};
};

BraidFactory.prototype.newSubscriptionRecord = function(targetUserId, targetDomain, subscriberUserId, subscriberDomain) {
	return {
		target : {
			userid : targetUserId,
			domain : targetDomain
		},
		subscriber : {
			userid : subscriberUserId,
			domain : subscriberDomain
		}
	};
};

BraidFactory.prototype.newUserObjectRecord = function(userid, objectType, objectId) {
	return {
		userid : userid,
		objectType : objectType,
		objectId : objectId
	};
};

BraidFactory.prototype.newObjectSummaryInfo = function(mutationCount, stateHash, latestMutationId, latestMutationCreated, latestMutationOriginator) {
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

BraidFactory.prototype.newTileRecord = function(tileId, appId, appVersion, pendingMutationCount, createdBy, created, objectSummaryInfo) {
	return {
		tileId : tileId,
		appId : appId,
		appVersion : appVersion,
		pendingMutationCount : pendingMutationCount,
		createdBy : createdBy,
		created : created,
		summaryInfo : objectSummaryInfo
	};
};

BraidFactory.prototype.newGroupRecord = function(groupId, pendingMutationCount, createdBy, created, objectSummaryInfo, members) {
	if (!members) {
		members = [];
	}
	return {
		tileId : tileId,
		pendingMutationCount : pendingMutationCount,
		createdBy : createdBy,
		created : created,
		summaryInfo : objectSummaryInfo,
		members : members
	};
};

BraidFactory.prototype.newSharedObjectRecord = function(objectType, objectId, sharingType, sharedWithUser, sharedWithGroupId) {
	return {
		objectType : objectType,
		objectId : objectId,
		sharingType : sharingType,
		sharedWithUser : sharedWithUser,
		sharedWithGroupId : sharedWithGroupId
	};
};

BraidFactory.prototype.newMutationRecord = function(objectType, objectId, mutationId, created, originator, action, value, file, stateHash, previousValue,
		integrated, index) {
	return {
		objectType : objectType,
		objectId : objectId,
		mutationId : mutationId,
		created : created,
		originator : originator,
		action : action,
		value : value,
		file : file,
		stateHash : stateHash,
		previousValue : previousValue,
		integrated : integrated,
		index : index
	};
};

BraidFactory.prototype.newFileRecord = function(objectType, objectId, name, file, updatedBy, updated) {
	return {
		objectType : objectType,
		objectId : objectId,
		file : file,
		updatedBy : updatedBy,
		updated : updated
	};
};

BraidFactory.prototype.newPropertyRecord = function(objectType, objectId, name, type, value, updatedBy, updated) {
	return {
		objectType : objectType,
		objectId : objectId,
		name : name,
		type : type,
		value : value,
		updatedBy : updatedBy,
		updated : updated
	};
};

BraidFactory.prototype.newCollectionRecord = function(objectType, objectId, collection, recordId, sort, value, file, updatedBy, updated) {
	return {
		objectType : objectType,
		objectId : objectId,
		collection : collection,
		recordId : recordId,
		sort : sort,
		value : value,
		file : file,
		updatedBy : updatedBy,
		updated : updated
	};
};

BraidFactory.prototype.newFileRecord = function(objectType, objectId, fileName, file) {
	return {
		objectType : objectType,
		objectId : objectId,
		fileName : fileName,
		file : file
	};
};

var factory = new BraidFactory();

if (typeof module !== 'undefined') {
	module.exports = factory;
}
