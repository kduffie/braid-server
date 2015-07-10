function AuthServerStub() {
	this.recordFound = true;
}

AuthServerStub.prototype.initialize = function(configuration, domainServices) {
	this.domain = configuration.domain;
	this.factory = domainServices.factory;
};

AuthServerStub.prototype.getUserRecord = function(userid, callback) {
	if (this.recordFound) {
		var userRecord = this.factory.newAccountRecord(userid, this.domain, "hash");
		callback(null, userRecord);
	} else {
		callback(null, null);
	}
};

AuthServerStub.prototype.setRecordFound = function(found) {
	this.recordFound = found;
};

module.exports = AuthServerStub;
