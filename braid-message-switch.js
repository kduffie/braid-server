/**
 * This module is used for delivering messages asynchronously between queues.
 */

var async = require('async');

var resourceRegistrations = {};
var userRegistrations = {};
var requestRegistrations = {};
var foreignDomainRegistrations = [];
var messageHooks = [];

var id = 1;

var stats = {
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

function reset() {
	userRegistrations = {};
	requestRegistrations = {};
	resourceRegistrations = {};
	stats = {
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
}

function registerResource(resource, domain, messageHandler) {
	stats.registrations.resource++;
	var list = resourceRegistrations[resource];
	if (!list) {
		list = {
			data : {
				count : 0,
				domain : domain
			}
		};
		resourceRegistrations[resource] = list;
	}
	var resourceId = "c" + id++;
	list[resourceId] = messageHandler;
	list.data.count++;
	return {
		type : 'resource',
		resource : resource,
		id : resourceId
	};
}

function getUserKey(userId, domain) {
	return domain + "/" + userId;
}

function registerUser(userId, domain, messageHandler) {
	stats.registrations.user++;
	var key = getUserKey(userId, domain);
	var list = userRegistrations[key];
	if (!list) {
		list = {
			data : {
				count : 0
			}
		};
		userRegistrations[key] = list;
	}
	var sessionId = "u" + id++;
	list[sessionId] = messageHandler;
	list.data.count++;
	return {
		type : 'user',
		key : key,
		id : sessionId
	};
}

function registerForRequests(requestType, messageHandler) {
	stats.registrations.request++;
	var list = requestRegistrations[requestType];
	if (!list) {
		list = {
			data : {
				count : 0
			}
		};
		requestRegistrations[requestType] = list;
	}
	var requestId = "r" + id++;
	list[requestId] = messageHandler;
	list.data.count++;
	return {
		type : 'request',
		requestType : requestType,
		id : requestId
	};
}

function registerForeignDomains(localDomain, messageHandler) {
	foreignDomainRegistrations.push({
		localDomain : localDomain,
		handler : messageHandler
	});
}

function unregister(registration) {
	switch (registration.type) {
	case 'user': {
		var slist = userRegistrations[registration.key];
		if (slist) {
			stats.registrations.user--;
			delete slist[registration.id];
			slist.data.count--;
			if (slist.data.count === 0) {
				delete userRegistrations[registration.key];
			}
		}
		break;
	}
	case 'resource': {
		var clist = resourceRegistrations[registration.resource];
		if (clist) {
			stats.registrations.resource--;
			delete clist[registration.id];
			clist.data.count--;
			if (clist.data.count === 0) {
				delete resourceRegistrations[registration.resource];
			}
		}
		break;
	}
	case 'request': {
		var rlist = requestRegistrations[registration.requestType];
		if (rlist) {
			stats.registrations.request--;
			delete rlist[registration.id];
			rlist.data.count--;
			if (rlist.data.count === 0) {
				delete requestRegistrations[registration.requestType];
			}
		}
		break;
	}
	}
}

function deliver(message, callback) {
	console.log("X ", message);
	stats.messages.received++;
	var tasks = [];
	tasks.push(function(callback) {
		if (message.to) {
			if (!Array.isArray(message.to)) {
				message.to = [ message.to ];
			}
			var handlers = [];
			for (var i = 0; i < message.to.length; i++) {
				var recipient = message.to[i];
				if (recipient.userId && recipient.domain) {
					var key = getUserKey(recipient.userId, recipient.domain);
					var list = userRegistrations[key];
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
				stats.messages.delivered++;
				callback();
			}, callback);
		} else {
			callback();
		}
	});
	tasks.push(function(callback) {
		if (message.to) {
			if (!Array.isArray(message.to)) {
				message.to = [ message.to ];
			}
			var handlers = [];
			for (var i = 0; i < message.to.length; i++) {
				var recipient = message.to[i];
				if (recipient.resource) {
					var list = resourceRegistrations[recipient.resource];
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
				stats.messages.delivered++;
				callback();
			}, callback);
		} else {
			callback();
		}
	});
	tasks.push(function(callback) {
		if (message.request) {
			var rlist = requestRegistrations[message.request];
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
				stats.messages.delivered++;
				callback();
			});
		} else {
			callback();
		}
	});
	tasks.push(function(callback) {
		if (message.to) {
			var fhandlers = [];
			var ldomains = [];
			for (var i = 0; i < foreignDomainRegistrations.length; i++) {
				var fdr = foreignDomainRegistrations[i];
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
				stats.messages.delivered++;
				callback();
			}, callback);
		} else {
			callback();
		}
	});
	tasks.push(function(callback) {
		async.each(messageHooks, function(hook, callback) {
			hook(message);
			stats.messages.hooked++;
			callback();
		});
	});
	async.parallel(tasks, callback);
}

function getStats() {
	return stats;
}

function registerHook(handler) {
	messageHooks.push(handler);
}

module.exports = {
	reset : reset,
	registerUser : registerUser,
	registerResource : registerResource,
	registerForRequests : registerForRequests,
	registerForeignDomains : registerForeignDomains,
	registerHook : registerHook,
	unregister : unregister,
	deliver : deliver,
	getStats : getStats
};
