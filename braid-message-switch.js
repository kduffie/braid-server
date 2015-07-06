/**
 * This module is used for delivering messages asynchronously between queues.
 */

var async = require('async');

var id = 1;

function MessageSwitch() {
}

MessageSwitch.prototype.initialize = function() {
	this.resourceRegistrations = {};
	this.userRegistrations = {};
	this.requestRegistrations = {};
	this.foreignDomainRegistrations = [];
	this.messageHooks = [];
	this.stats = {
		registrations : {
			user : 0,
			resource : 0,
			request : 0
		},
		messages : {
			received : 0,
			delivered : 0,
			hooked : 0,
		}
	};
};

MessageSwitch.prototype.registerResource = function(resource, domain, messageHandler) {
	this.stats.registrations.resource++;
	var list = this.resourceRegistrations[resource];
	if (!list) {
		list = {
			data : {
				count : 0,
				domain : domain
			}
		};
		this.resourceRegistrations[resource] = list;
	}
	var resourceId = "c" + id++;
	list[resourceId] = messageHandler;
	list.data.count++;
	return {
		type : 'resource',
		resource : resource,
		id : resourceId
	};
};

MessageSwitch.prototype._getUserKey = function(userId, domain) {
	return domain + "/" + userId;
};

MessageSwitch.prototype.registerUser = function(userId, domain, messageHandler) {
	this.stats.registrations.user++;
	var key = this._getUserKey(userId, domain);
	var list = this.userRegistrations[key];
	if (!list) {
		list = {
			data : {
				count : 0
			}
		};
		this.userRegistrations[key] = list;
	}
	var sessionId = "u" + id++;
	list[sessionId] = messageHandler;
	list.data.count++;
	return {
		type : 'user',
		key : key,
		id : sessionId
	};
};

MessageSwitch.prototype.registerForRequests = function(requestType, messageHandler) {
	this.stats.registrations.request++;
	var list = this.requestRegistrations[requestType];
	if (!list) {
		list = {
			data : {
				count : 0
			}
		};
		this.requestRegistrations[requestType] = list;
	}
	var requestId = "r" + id++;
	list[requestId] = messageHandler;
	list.data.count++;
	return {
		type : 'request',
		requestType : requestType,
		id : requestId
	};
};

MessageSwitch.prototype.registerForeignDomains = function(localDomain, messageHandler) {
	this.foreignDomainRegistrations.push({
		localDomain : localDomain,
		handler : messageHandler
	});
};

MessageSwitch.prototype.unregister = function(registration) {
	switch (registration.type) {
	case 'user': {
		var slist = this.userRegistrations[registration.key];
		if (slist) {
			this.stats.registrations.user--;
			delete slist[registration.id];
			slist.data.count--;
			if (slist.data.count === 0) {
				delete this.userRegistrations[registration.key];
			}
		}
		break;
	}
	case 'resource': {
		var clist = this.resourceRegistrations[registration.resource];
		if (clist) {
			this.stats.registrations.resource--;
			delete clist[registration.id];
			clist.data.count--;
			if (clist.data.count === 0) {
				delete this.resourceRegistrations[registration.resource];
			}
		}
		break;
	}
	case 'request': {
		var rlist = this.requestRegistrations[registration.requestType];
		if (rlist) {
			this.stats.registrations.request--;
			delete rlist[registration.id];
			rlist.data.count--;
			if (rlist.data.count === 0) {
				delete this.requestRegistrations[registration.requestType];
			}
		}
		break;
	}
	}
};

MessageSwitch.prototype.deliver = function(message, callback) {
	// if (this.config && this.config.debug && this.config.debug.messageSwitch && this.config.debug.messageSwitch.logMessages) {
	console.log("X ", message);
	// }
	this.stats.messages.received++;
	if (message.to && !Array.isArray(message.to)) {
		message.to = [ message.to ];
	}
	var tasks = [];
	tasks.push(function(callback) {
		if (message.to) {
			var handlers = [];
			for (var i = 0; i < message.to.length; i++) {
				var recipient = message.to[i];
				if (recipient.userId && recipient.domain) {
					var key = this._getUserKey(recipient.userId, recipient.domain);
					var list = this.userRegistrations[key];
					if (list) {
						for ( var item in list) {
							if (list.hasOwnProperty(item) && item !== 'data') {
								if (typeof list[item] !== 'function') {
									throw "Invalid handler";
								}
								handlers.push(list[item]);
							}
						}
					}
				}
			}
			async.each(handlers, function(handler, callback) {
				handler(message);
				this.stats.messages.delivered++;
				callback();
			}.bind(this), callback);
		} else {
			callback();
		}
	}.bind(this));
	tasks.push(function(callback) {
		if (message.to) {
			var handlers = [];
			for (var i = 0; i < message.to.length; i++) {
				var recipient = message.to[i];
				if (recipient.resource) {
					var list = this.resourceRegistrations[recipient.resource];
					if (list) {
						if (!list.data.domain || list.data.domain === recipient.domain) {
							for ( var item in list) {
								if (list.hasOwnProperty(item) && item !== 'data') {
									if (typeof list[item] !== 'function') {
										throw "Invalid handler";
									}
									handlers.push(list[item]);
								}
							}
						}
					}
				}
			}
			async.each(handlers, function(handler, callback) {
				handler(message);
				this.stats.messages.delivered++;
				callback();
			}.bind(this), callback);
		} else {
			callback();
		}
	}.bind(this));
	tasks.push(function(callback) {
		if (message.request) {
			var rlist = this.requestRegistrations[message.request];
			var rhandlers = [];
			if (rlist) {
				for ( var ritem in rlist) {
					if (rlist.hasOwnProperty(ritem) && ritem !== 'data') {
						if (typeof rlist[ritem] !== 'function') {
							throw "Invalid handler";
						}
						rhandlers.push(rlist[ritem]);
					}
				}
			}
			async.each(rhandlers, function(rhandler, callback) {
				rhandler(message);
				this.stats.messages.delivered++;
				callback();
			}.bind(this), callback);
		} else {
			callback();
		}
	}.bind(this));
	tasks.push(function(callback) {
		if (message.to) {
			var fhandlers = [];
			var ldomains = [];
			for (var i = 0; i < this.foreignDomainRegistrations.length; i++) {
				var fdr = this.foreignDomainRegistrations[i];
				for (var j = 0; j < message.to.length; j++) {
					if (message.to[j] && message.to[j].domain && fdr.localDomain !== message.to[j].domain) {
						if (ldomains.indexOf(fdr.localDomain) < 0) {
							ldomains.push(fdr.localDomain);
							fhandlers.push(fdr.handler);
						}
					}
				}
			}
			async.each(fhandlers, function(fhandler, callback) {
				fhandler(message);
				this.stats.messages.delivered++;
				callback();
			}.bind(this), callback);
		} else {
			callback();
		}
	}.bind(this));
	tasks.push(function(callback) {
		async.each(this.messageHooks, function(hook, callback) {
			hook(message);
			this.stats.messages.hooked++;
			callback();
		}.bind(this), callback);
	}.bind(this));
	async.parallel(tasks, callback);
};

MessageSwitch.prototype.getStats = function() {
	return this.stats;
};

MessageSwitch.prototype.registerHook = function(handler) {
	this.messageHooks.push(handler);
};

module.exports = MessageSwitch;
