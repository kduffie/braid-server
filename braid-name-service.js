var dns = require('dns');

function resolveServer(domain, protocol, serviceName, defaultPort, devModePortOffset, callback) {
	// To handle development scenarios, we'll handle a special case where domain name ends in a port number, which would not
	// be a legal domain name. So we can safely handle this one as special.

	if (domain.match(/.*\.\d+/)) {
		var index = domain.lastIndexOf('.');
		var port = Number(domain.substring(index + 1));
		port += devModePortOffset;
		console.log("Resolving domain server based on development mode domain: " + domain);
		callback(null, protocol + "://localhost:" + port);
		return;
	}

	dns.resolveSrv('_' + serviceName + '._tcp.' + domain, function onLookup(err, addresses) {
		console.log('SRV addresses for ' + domain, addresses);
		if (addresses && addresses.length > 0) {
			// TODO: should try multiple targets in priority order, if available
			callback(null, protocol + "://" + addresses[0].name + ":" + addresses[0].port);
		} else {
			// Otherwise, we assume a "standard" port number for braid federation
			callback(null, protocol + "://" + domain + ":" + defaultPort);
		}
	});
}

function resolveBraidServer(config, domain, callback) {
	var protocol = 'wss';
	if (config && config.federation && !config.federation.ssl) {
		protocol = 'ws';
	}
	resolveServer(domain, protocol, 'braid-server', 25557, 0, callback);
}

function resolveFileServer(config, domain, callback) {
	var protocol = 'https';
	if (config && config.federation && !config.federation.ssl) {
		protocol = 'http';
	}
	resolveServer(domain, protocol, 'braid-file-server', 25567, 10, callback);
}

module.exports = {
	resolveBraidServer : resolveBraidServer,
	resolveFileServer : resolveFileServer
};