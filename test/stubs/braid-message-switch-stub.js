function MessageSwitchStub() {
	this.hooks = [];
	this.waiter = null;
}

MessageSwitchStub.prototype.initialize = function() {
};

MessageSwitchStub.prototype.registerResource = function(resource, domain, messageHandler) {
};

MessageSwitchStub.prototype.registerUser = function(userId, domain, messageHandler) {
};

MessageSwitchStub.prototype.registerForRequests = function(requestType, messageHandler) {
};

MessageSwitchStub.prototype.registerForeignDomains = function(localDomain, messageHandler) {
};

MessageSwitchStub.prototype.unregister = function(registration) {
};

MessageSwitchStub.prototype.registerForeignDomains = function(localDomain, messageHandler) {
};

MessageSwitchStub.prototype.registerHook = function(handler) {
	this.hooks.push(handler);
};

MessageSwitchStub.prototype.deliver = function(message, callback) {
	if (this.waiter) {
		this.waiter(null, message);
		this.waiter = null;
	}
	if (callback) {
		callback();
	}
};

MessageSwitchStub.prototype.getStats = function() {
};

MessageSwitchStub.prototype.waitForMessage = function(timeout, callback) {
	var timer;
	this.waiter = function(err, message) {
		clearTimeout(timer);
		callback(err, message);
	};
	timer = setTimeout(function() {
		callback("timeout");
	}.bind(this), timeout);
};

module.exports = MessageSwitchStub;