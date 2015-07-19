var MongoClient = require('mongodb').MongoClient;
var async = require('async');

function BraidDb() {
}

BraidDb.prototype.initialize = function(configuration, callback) {
	console.log("db: initializing");
	this.config = configuration;
	this.mongoUrl = this.config.mongo.mongoUrl;
	this.options = this.config.mongo.options;
	this.accounts = null;
	this.subscriptions = null;
	this.userObjects = null;
	this.tiles = null;
	this.groups = null;
	this.sharedObjects = null;
	this.mutations = null;
	this.files = null;
	this.properties = null;
	this.records = null;
	this.mutationReverseSort = {
		created : -1,
		originator : -1
	};
	this.mutationForwardSort = {
		created : 1,
		originator : 1
	};
	this._open(callback);
}

BraidDb.prototype._open = function(callback) {
	var steps = [];
	steps.push(function(callback) {
		console.log("Opening mongo at " + this.mongoUrl);
		MongoClient.connect(this.mongoUrl, callback);
	}.bind(this));

	steps.push(function(db, callback) {
		this.db = db;
		if (this.options && this.options.dropDbOnStartup) {
			db.dropDatabase(function(err, result) {
				if (err) {
					callback(err);
				} else {
					db.open(function(err, reopenedDb) {
						if (err) {
							callback(err);
						}
						this.db = reopenedDb;
						this._setup(callback);
					}.bind(this));
				}
			}.bind(this));
		} else {
			this._setup(callback);
		}
	}.bind(this));

	async.waterfall(steps, callback);
};

BraidDb.prototype.close = function(callback) {
	// this.db.close(false, callback); KD: seems to be a bug in the mongo driver for node. This throws an uncatchable.
	if (callback) {
		callback();
	}
};

BraidDb.prototype._setup = function(callback) {
	async.parallel([
					this._setupAccounts.bind(this),
					this._setupSubscriptions.bind(this),
					this._setupTiles.bind(this),
					this._setupGroups.bind(this),
					this._setupUserObjects.bind(this),
					this._setupMutations.bind(this),
					this._setupFiles.bind(this),
					this._setupProperties.bind(this),
					this._setupRecords.bind(this) ], function(err) {
		if (err) {
			callback(err);
		} else {
			callback(null, this);
		}
	}.bind(this));
};

BraidDb.prototype._setupAccounts = function(callback) {
	this.accounts = this.db.collection("accounts");
	this.accounts.ensureIndex({
		userid : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupSubscriptions = function(callback) {
	this.subscriptions = this.db.collection("subscriptions");
	var steps = [];
	steps.push(function(callback) {
		this.subscriptions.ensureIndex({
			"target.userid" : 1,
			"target.domain" : 1
		}, {
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.subscriptions.ensureIndex({
			"subscriber.userid" : 1,
			"subscriber.domain" : 1
		}, {
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupTiles = function(callback) {
	this.tiles = this.db.collection("tiles");
	var steps = [];
	steps.push(function(callback) {
		this.tiles.ensureIndex({
			tileId : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupGroups = function(callback) {
	this.groups = this.db.collection("groups");
	var steps = [];
	steps.push(function(callback) {
		this.groups.ensureIndex({
			groupId : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupUserObjects = function(callback) {
	this.userObjects = this.db.collection("userObjects");
	this.userObjects.ensureIndex({
		userid : 1,
		objectType : 1,
		objectId : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupMutations = function(callback) {
	this.mutations = this.db.collection("mutations");
	var steps = [];
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			objectType : 1,
			objectId : 1,
			mutationId : 1,
			integrated : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			objectType : 1,
			objectId : 1,
			mutationId : 1,
			integrated : 1,
			index : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			objectType : 1,
			objectId : 1,
			integrated : 1,
			created : -1,
			originator : -1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.mutations.ensureIndex({
			objectType : 1,
			objectId : 1,
			integrated : 1,
			created : 1,
			originator : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype._setupFiles = function(callback) {
	this.files = this.db.collection("files");
	this.files.ensureIndex({
		objectType : 1,
		objectId : 1,
		name : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupProperties = function(callback) {
	this.properties = this.db.collection("properties");
	this.properties.ensureIndex({
		objectType : 1,
		objectId : 1,
		name : 1
	}, {
		unique : true,
		w : 1
	}, callback);
};

BraidDb.prototype._setupRecords = function(callback) {
	this.records = this.db.collection("records");
	var steps = [];
	steps.push(function(callback) {
		this.records.ensureIndex({
			objectType : 1,
			objectId : 1,
			recordId : 1,
			sort : 1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	steps.push(function(callback) {
		this.records.ensureIndex({
			objectType : 1,
			objectId : 1,
			sort : -1
		}, {
			unique : true,
			w : 1
		}, callback);
	}.bind(this));
	async.parallel(steps, callback);
};

BraidDb.prototype.insertAccount = function(record, callback) {
	this.accounts.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findAccountById = function(userid, callback /* (err, record) */) {
	this.accounts.findOne({
		userid : userid
	}, callback);
};

BraidDb.prototype.iterateAccounts = function(callback /* (err, cursor) */) {
	var cursor = this.accounts.find({});
	callback(null, cursor);
};

BraidDb.prototype.insertSubscription = function(record, callback) {
	this.subscriptions.insertOne(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findSubscribersByTarget = function(targetUserId, targetDomain, callback /* (err, records) */) {
	this.subscriptions.find({
		"target.userid" : targetUserId,
		"target.domain" : targetDomain
	}).toArray(callback);
};

BraidDb.prototype.findSubscription = function(targetUserId, targetDomain, subscriberUserId, subscriberDomain, callback /* (err, record) */) {
	this.subscriptions.findOne({
		"target.userid" : targetUserId,
		"target.domain" : targetDomain,
		"subscriber.userid" : subscriberUserId,
		"subscriber.domain" : subscriberDomain
	}, callback);
};

BraidDb.prototype.findTargetsBySubscriber = function(subscriberUserId, subscriberDomain, callback /* (err, records) */) {
	this.subscriptions.find({
		"subscriber.userid" : subscriberUserId,
		"subscriber.domain" : subscriberDomain
	}).toArray(callback);
};

BraidDb.prototype.removeSubscription = function(targetUserId, targetDomain, subscriberUserId, subscriberDomain, callback) {
	this.subscriptions.deleteOne({
		"target.userid" : targetUserId,
		"target.domain" : targetDomain,
		"subscriber.userid" : subscriberUserId,
		"subscriber.domain" : subscriberDomain
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.insertTile = function(record, callback) {
	this.tiles.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findTileById = function(tileId, callback /* (err, record) */) {
	this.tiles.findOne({
		tileId : tileId
	}, callback);
};

BraidDb.prototype.insertGroup = function(record, callback) {
	this.groups.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findGroupById = function(groupId, callback /* (err, record) */) {
	this.groups.findOne({
		groupId : groupId
	}, callback);
};

BraidDb.prototype.insertUserObject = function(record, callback) {
	this.userObjects.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findUserObject = function(userid, objectType, objectId, callback /* (err, record) */) {
	this.userTiles.findOne({
		userid : userid,
		objectType : objectType,
		objectId : objectId
	}, callback);
};

BraidDb.prototype.iterateUserObjects = function(userid, callback /* (err, cursor) */) {
	var cursor = this.userObjects.find({
		userid : userid
	});
	callback(null, cursor);
};

BraidDb.prototype.insertMutation = function(record, callback) {
	this.mutations.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.findMutation = function(objectType, objectId, mutationId, callback /* (err, record) */) {
	this.mutations.findOne({
		objectType : objectType,
		objectId : objectId,
		mutationId : mutationId
	}, callback);
};

BraidDb.prototype.isMutationExists = function(objectType, objectId, mutationId, integratedOnly, unintegratedOnly, callback /* (exists) */) {
	var query;
	if (integratedOnly) {
		query = {
			objectType : objectType,
			objectId : objectId,
			mutationId : mutationId,
			integrated : true
		};
	} else if (unintegratedOnly) {
		query = {
			objectType : objectType,
			objectId : objectId,
			mutationId : mutationId,
			integrated : false
		};
	} else {
		query = {
			objectType : objectType,
			objectId : objectId,
			mutationId : mutationId
		};
	}
	this.mutations.find(query).count(function(err, count) {
		if (err) {
			callback(false);
		} else {
			callback(count > 0);
		}
	}.bind(this));
};

BraidDb.prototype.getLatestMutation = function(objectType, objectId, callback /* (err, record) */) {
	this.mutations.find({
		objectType : objectType,
		objectId : objectId,
		integrated : true
	}).sort(this.mutationReverseSort).nextObject(callback);
};

BraidDb.prototype.decrementTilePendingMutations = function(tileId, callback) {
	this.tiles.update({
		tileId : tileId
	}, {
		$incr : {
			pendingMutations : -1
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.decrementGroupPendingMutations = function(groupId, callback) {
	this.groups.update({
		groupId : groupId
	}, {
		$incr : {
			pendingMutations : -1
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.countMutations = function(objectType, objectId, callback /* (err, count) */) {
	var cursor = this.mutations.find({
		objectType : objectType,
		objectId : objectId,
		integrated : true
	}).count(false, {}, callback);
};

BraidDb.prototype.iterateMutations = function(objectType, objectId, reverseChronological, callback /* (err, cursor) */) {
	var sort;
	if (reverseChronological) {
		sort = this.mutationReverseSort;
	} else {
		sort = this.mutationForwardSort;
	}
	var cursor = this.mutations.find({
		objectType : objectType,
		objectId : objectId,
		integrated : true
	}).sort(sort);
	callback(null, cursor);
};

BraidDb.prototype.iterateMutationsAfterIndex = function(objectType, objectId, index, callback /* (err, cursor) */) {
	var sort;
	sort = this.mutationForwardSort;
	var cursor = this.mutations.find({
		objectType : objectType,
		objectId : objectId,
		integrated : true,
		index : {
			'$gt' : index
		}
	}).sort(sort);
	callback(null, cursor);
};

BraidDb.prototype.setMutationIntegrated = function(objectType, objectId, mutationId, integrated, callback) {
	this.mutations.update({
		objectType : objectType,
		objectId : objectId,
		mutationId : mutationId
	}, {
		$set : {
			integrated : integrated
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.updateMutationState = function(objectType, objectId, mutationId, stateHash, integrated, index, callback) {
	this.mutations.update({
		objectType : objectType,
		objectId : objectId,
		mutationId : mutationId
	}, {
		$set : {
			stateHash : stateHash,
			integrated : integrated,
			index : index
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.updateTileSummaryInfo = function(tileId, summaryInfo, callback) {
	this.tiles.update({
		tileId : tileId
	}, {
		$set : {
			summaryInfo : summaryInfo
		}
	}, {
		w : 1
	}, callback);
};

BraidDb.prototype.updateGroupSummaryInfo = function(groupId, summaryInfo, callback) {
	this.groups.update({
		groupId : groupId
	}, {
		$set : {
			summaryInfo : summaryInfo
		}
	}, {
		w : 1
	}, callback);
}

BraidDb.prototype.insertFile = function(record, callback) {
	this.files.insert(record, {
		w : 1
	}, callback);
};

BraidDb.prototype.getProperty = function(objectType, objectId, propertyName, callback /* (err, record) */) {
	this.properties.findOne({
		objectType : objectType,
		objectId : objectId,
		name : propertyName
	}, callback);
};

BraidDb.prototype.setProperty = function(record, callback) {
	this.properties.update({
		objectType : record.objectType,
		objectId : record.objectId,
		name : record.name
	}, record, {
		upsert : true,
		w : 1
	}, callback);
};

BraidDb.prototype.deleteProperty = function(objectType, objectId, name, callback) {
	this.tilePropertiesCollection.remove({
		objectType : objectType,
		objectId : objectId,
		name : name
	}, {
		w : 1
	}, callback);
};

module.exports = BraidDb;
